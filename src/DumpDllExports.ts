import { readJson } from './WinMetaUtil'
import fs from 'fs/promises'
import cp from 'child_process'
import path from 'path'

interface DllImportStat {
  totalCount: number
  polyfillCount: number
}

interface DllImportItem extends DllImportStat {
  name: string
  hasDll?: boolean
  hasLib?: boolean
}

const WinPolyfillRoot = 'C:/work/win-polyfill/'
const Dumpbin =
  'C:/Program Files (x86)/Microsoft Visual Studio 14.0/VC/bin/amd64/dumpbin.exe'
export const dumpDllWorkDir = path.join(WinPolyfillRoot, 'tmp')
export const Win200Sp4DirRaw = path.join(WinPolyfillRoot, 'Windows2000-SP4')
const Win200Sp4DirDll = path.join(WinPolyfillRoot, 'Windows2000-SP4-Dll')
const Win10SdkDir = 'C:/Program Files (x86)/Windows Kits/10/'
const Win10SdkVersion = '10.0.19041.0'
const Win10SdkDirLib = path.join(Win10SdkDir, `Lib/${Win10SdkVersion}/um`)

export async function tryCreateLink(
  sourcePath: string,
  targetPath: string,
): Promise<boolean> {
  try {
    await fs.access(sourcePath)
    try {
      await fs.unlink(targetPath)
    } catch (error) {}
    await fs.link(sourcePath, targetPath)
    return true
  } catch (e) {
    return false
  }
}
export async function DumpDllExtract(
  sourceDir: string,
  targetDir: string,
  dllImportList: DllImportItem[],
): Promise<void> {
  for (const dllImportItem of dllImportList) {
    const CabPath = path.join(sourceDir, dllImportItem.name + '.DL_')
    const targetCabPath = path.join(targetDir, dllImportItem.name + '.cab')
    if (await tryCreateLink(CabPath, targetCabPath)) {
      continue
    }
    const DllPath = path.join(sourceDir, dllImportItem.name + '.dll')
    const targetDllPath = path.join(targetDir, dllImportItem.name + '.dll')
    if (await tryCreateLink(DllPath, targetDllPath)) {
      continue
    }
    console.log(`no ${CabPath} and ${DllPath}`)
  }
}

// const ArchList = ['x86', 'x64', 'arm64', 'arm']

const ArchList = ['x86']

export type ArchType = 'x86' | 'x64' | 'arm64' | 'arm'

export default function spawnAsync(
  commmand: string,
  args: string[],
  options: cp.SpawnOptions,
): Promise<cp.SpawnSyncReturns<Buffer>> {
  // *** Return the promise
  return new Promise(function (resolve, reject) {
    const process = cp.spawn(commmand, args, options)
    const chunksStdout: Buffer[] = []
    const chunksStderr: Buffer[] = []
    process.stdout?.on('data', (chunk) => chunksStdout.push(chunk))
    process.stderr?.on('data', (chunk) => chunksStderr.push(chunk))
    process.on('close', function (code) {
      // Should probably be 'exit', not 'close'
      // *** Process completed
      resolve({
        pid: process.pid ?? -1,
        status: code,
        stdout: Buffer.concat(chunksStdout),
        stderr: Buffer.concat(chunksStderr),
        signal: process.signalCode,
        output: [],
      })
    })
    process.on('error', function (err) {
      // *** Process creation failed
      reject(err)
    })
  })
}

export async function DumpBin(
  binPath: string,
  args: string[],
): Promise<string[]> {
  try {
    const result = (await spawnAsync(Dumpbin, [...args, binPath], {})).stdout
    return result.toString('latin1')?.split('\r\n') ?? []
  } catch (error) {
    console.log(`no ${binPath}`)
  }
  return []
}

export async function UpdateDllExports(
  dllImportList: DllImportItem[],
  libdir: string,
): Promise<void> {
  const map = new Map<string, DllImportItem>()
  for (const item of dllImportList) {
    map.set(item.name, item)
  }
  const win10LibFile = await fs.readdir(libdir)
  for (const item of win10LibFile) {
    const libname = item.toLowerCase()
    if (libname.endsWith('.lib')) {
      const dllname = libname.substr(0, libname.length - '.lib'.length)
      // console.log(dllname)
      const existItem = map.get(dllname)
      if (existItem) {
        existItem.hasLib = true
      } else {
        const newItem: DllImportItem = {
          name: dllname,
          polyfillCount: 0,
          totalCount: 0,
          hasLib: true,
        }
        dllImportList.push(newItem)
        map.set(dllname, newItem)
        // console.log(dllname)
      }
    }
  }
  console.log(dllImportList.length)
}

export async function updateWinSdkLib(
  rootDir: string,
  dllImportList: DllImportItem[],
): Promise<void> {
  console.log(dllImportList.length)
  for (const arch of ArchList) {
    await UpdateDllExports(dllImportList, path.join(Win10SdkDirLib, arch))
  }
  console.log(dllImportList.length)
  dllImportList.sort((a, b) => a.name.localeCompare(b.name))
  fs.writeFile(
    path.join(rootDir, 'win-polyfill-dll-list.json'),
    JSON.stringify(dllImportList, null, 2),
  )
}

interface DumpBinaryItem {
  name: string
  path: string
  suffix: string
  exports?: string[]
  symbols?: string[]
}

export async function DumpBinaryForItem(
  filesToDump: DumpBinaryItem[],
  dllImportItem: DllImportItem,
  arch: string,
): Promise<void> {
  const promises: Promise<string[]>[] = []
  filesToDump.forEach((item: DumpBinaryItem) => {
    const promiseExports = DumpBin(
      path.join(item.path, arch, dllImportItem.name + item.suffix),
      ['/EXPORTS'],
    ).then((x) => (item.exports = x))
    promises.push(promiseExports)

    const promiseSymbols = DumpBin(
      path.join(item.path, arch, dllImportItem.name + item.suffix),
      ['/SYMBOLS'],
    ).then((x) => (item.symbols = x))
    promises.push(promiseSymbols)
  })
  await Promise.all(promises)
}

export async function DumpBinaryFiles(
  rootDir: string,
  dllImportList: DllImportItem[],
): Promise<void> {
  const allDump = []
  for (const arch of ArchList) {
    const dumpListForArch = []
    for (const dllImportItem of dllImportList) {
      const dumpItem = [
        {
          name: 'Win10Sdk',
          path: Win10SdkDirLib,
          suffix: '.lib',
        },
        {
          name: 'Win200Sp4',
          path: Win200Sp4DirDll,
          suffix: '.dll',
        },
      ]
      await DumpBinaryForItem(dumpItem, dllImportItem, arch)
      dumpListForArch.push({
        name: dllImportItem.name,
        hasLib: dllImportItem.hasLib,
        dumpItem: dumpItem,
      })
      console.log(`Dumped for ${arch} ${dllImportItem.name}`)
    }
    allDump.push({ arch, dumpList: dumpListForArch })
  }

  const win10SdkLibExportsFile = path.join(
    rootDir,
    `win-polyfill-lib-dll-dumps.txt`,
  )
  await fs.writeFile(win10SdkLibExportsFile, JSON.stringify(allDump, null, 2))
}

// d3dcompiler.lib
export async function DumpDllExports(rootDir: string): Promise<void> {
  const dllImportList = (await readJson(
    path.join(rootDir, 'win-polyfill-dll-list.json'),
  )) as DllImportItem[]
  // updateWinSdkLib(rootDir, dllImportList)
  // DumpDllExtract(Win200Sp4DirRaw, dumpDllWorkDir, dllImportList)

  DumpBinaryFiles(rootDir, dllImportList)
}
