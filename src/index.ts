import fs from 'fs/promises'
import path from 'path'
import { normalizeDllImport, normalizePlatform, readJson } from './WinMetaUtil'
import {
  ApiInformation,
  DllImportStat,
  DllImportWithName,
  FunctionInfo,
  PlatformInfo,
  WinMetaApi,
} from './WinMetadata'
import { DumpDllExports, updateWinSdkLib } from './DumpDllExports'
import { ExtractWinApi } from './ExtractWinApi'

const rootDir = path.join(__dirname, '..')

export async function unused1(): Promise<void> {
  const content = await fs.readFile(path.join(rootDir, 'symbols.txt'), 'utf-8')
  const apis = content.split('\r\n')
  const aiiSet: ApiInformation[] = []
  let index = 0
  for (const api of apis) {
    index += 1
    console.log(api)
    aiiSet.push({
      Index: index,
      Name: api,
      DllImport: '',
      Platform: '',
    } as ApiInformation)
  }
  fs.writeFile(
    path.join(rootDir, 'win-polyfill.json'),
    JSON.stringify(aiiSet, null, 2),
  )
}
interface VersionInfo {
  major: number
  minor: number
  patch: number
}

function parseVersion(version: string): VersionInfo {
  const v = version.split('.').map((x) => parseInt(x))
  return {
    major: v[0],
    minor: v[1],
    patch: v[2],
  }
}

export async function loadWinApiMetadataPlatformSet(): Promise<void> {
  const apiRoot = path.join(rootDir, 'api')
  const files = await fs.readdir(apiRoot)
  const platformSet = new Set()
  for (const f of files) {
    const apiFile = path.join(apiRoot, f)
    // console.log(apiFile)
    const info = (await readJson(apiFile)) as WinMetaApi
    for (const f of info.Functions) {
      const platform = normalizePlatform(f.Platform)
      if (platform !== null) {
        platformSet.add(platform)
      }
    }
  }
  const list = []
  console.log(Array.from(platformSet.keys()))
  for (const x of Array.from(platformSet.keys())) {
    list.push({
      Platform: x,
      Version: '0.0.0',
    })
  }
  console.log(JSON.stringify(list, null, 2))
}

async function loadApiSet(p: string) {
  // console.log(platformMap)
  const apiMap = new Map<string, ApiInformation>()
  const apiList = (await readJson(p)) as ApiInformation[]
  let maximalApiIndex = 0
  for (const apiItem of apiList) {
    apiMap.set(apiItem.Name, apiItem)
    maximalApiIndex = Math.max(maximalApiIndex, apiItem.Index)
  }
  return {
    apiMap,
    apiList,
    maximalApiIndex,
  }
}

function updateDllImportStat(
  map: Map<string, DllImportStat>,
  DllImport: string,
  key: keyof DllImportStat,
) {
  const stat = map.get(DllImport) ?? {
    totalCount: 0,
    polyfillCount: 0,
  }
  stat[key] += 1
  if (!map.has(DllImport)) {
    map.set(DllImport, stat)
  }
}

export async function createPolyfillDllList(): Promise<void> {
  const platformList = (await readJson(
    path.join(rootDir, 'platform-set.json'),
  )) as PlatformInfo[]
  const PlatformsToSkip = platformList.slice(0, 5).map((x) => x.Platform)
  console.log(PlatformsToSkip)
  const platformMap = new Map<string, VersionInfo>()
  for (const p of platformList) {
    platformMap.set(p.Platform, parseVersion(p.Version))
  }
  // console.log(platformMap)
  let { apiMap, apiList, maximalApiIndex } = await loadApiSet(
    path.join(rootDir, 'win-polyfill.json'),
  )
  console.log(maximalApiIndex)
  const patchApiSet = await loadApiSet(
    path.join(rootDir, 'win-polyfill-patch.json'),
  )

  const apiRoot = path.join(rootDir, 'api')
  const allFunctions: FunctionInfo[] = []
  const allFunctionsMap = new Map<string, FunctionInfo>()
  const files = await fs.readdir(apiRoot)
  for (const f of files) {
    const apiFile = path.join(apiRoot, f)
    // console.log(apiFile)
    const info = (await readJson(apiFile)) as WinMetaApi
    for (const fn of info.Functions as FunctionInfo[]) {
      allFunctions.push(fn)
      if (allFunctionsMap.has(fn.Name)) {
        console.log(`Duplicated ${fn.Name}`)
      } else {
        fn.Module = f.substr(0, f.length - '.json'.length)
        allFunctionsMap.set(fn.Name, fn)
      }
    }
  }

  const DllImportSet = new Map<string, DllImportWithName>()
  for (const f of allFunctions) {
    const platform = normalizePlatform(f.Platform)
    const DllImport = normalizeDllImport(f.DllImport)
    updateDllImportStat(DllImportSet, DllImport, 'totalCount')
    if (platform !== null && PlatformsToSkip.indexOf(platform) < 0) {
      if (!apiMap.has(f.Name)) {
        maximalApiIndex += 1
        const newApi: ApiInformation = {
          Index: maximalApiIndex,
          Module: f.Module,
          Name: f.Name,
          Platform: platform,
          DllImport: DllImport,
        } as ApiInformation
        apiList.push(newApi)
      }
    }
  }

  for (const existApi of apiList) {
    const patchApi = patchApiSet.apiMap.get(existApi.Name)
    let f = allFunctionsMap.get(existApi.Name)
    if (!f) {
      if (patchApi) {
        f = patchApi.ForwardName
          ? allFunctionsMap.get(patchApi.ForwardName)
          : undefined
      }
      console.log(existApi.Name)
    }
    if (f) {
      const platform = normalizePlatform(f.Platform)
      existApi.Module = f.Module
      existApi.DllImport = normalizeDllImport(f.DllImport)
      if (platform !== null) {
        existApi.Platform = platform
      }
      if (existApi.Platform === undefined) {
        console.log(existApi.Name)
      }
      existApi.ReturnType = f.ReturnType
      existApi.Params = f.Params
      existApi.Architectures = f.Architectures
    }
    if (patchApi !== undefined) {
      if (patchApi.Platform) {
        existApi.Platform = patchApi.Platform
      }
      if (patchApi.DllImport) {
        existApi.DllImport = normalizeDllImport(patchApi.DllImport)
      }
      if (patchApi.ReturnType) {
        existApi.ReturnType = patchApi.ReturnType
      }
      if (patchApi.Params) {
        existApi.Params = patchApi.Params
      }
      if (patchApi.Architectures) {
        existApi.Architectures = patchApi.Architectures
      }
    }
    updateDllImportStat(DllImportSet, existApi.DllImport, 'polyfillCount')
  }

  fs.writeFile(
    path.join(rootDir, 'win-polyfill.json'),
    JSON.stringify(apiList, null, 2),
  )
  let dllList = []
  const existDllList = (await readJson(
    path.join(rootDir, 'win-polyfill-dll-list-manual.json'),
  )) as DllImportWithName[]
  for (const exitItem of existDllList) {
    const normalName = exitItem.name.toLowerCase()
    if (!DllImportSet.has(normalName)) {
      DllImportSet.set(normalName, exitItem)
    }
  }
  const dllListSorted = Array.from(DllImportSet.entries()).sort()
  for (const [name, { totalCount, polyfillCount }] of dllListSorted) {
    dllList.push({
      name,
      totalCount,
      polyfillCount,
    })
    if (totalCount > 0) {
      // console.log(`${Name} ${Count}`)
    }
  }
  dllList = await updateWinSdkLib(rootDir, dllList)
  fs.writeFile(
    path.join(rootDir, 'win-polyfill-dll-list.json'),
    JSON.stringify(dllList, null, 2),
  )
  console.log(
    `done createPolyfillDllList moduleCount:${dllList.length} functionCount: ${allFunctions.length}`,
  )
}

async function start() {
  await createPolyfillDllList()
  await DumpDllExports(rootDir)
  // ExtractWinApi(rootDir)
}

start()
