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
const DumpbinX86 =
  'C:/Program Files (x86)/Microsoft Visual Studio 14.0/VC/bin/dumpbin.exe'
const dumpDllWorkDir = path.join(WinPolyfillRoot, 'tmp')
const Win200Sp4DirRaw = path.join(WinPolyfillRoot, 'Windows2000-SP4')
const Win200Sp4DirDll = path.join(WinPolyfillRoot, 'Windows2000-SP4-Dll')
const Win10SdkDir = 'C:/Program Files (x86)/Windows Kits/10/'
const Win10SdkVersion = '10.0.19041.0'
const Win10SdkDirLib = path.join(Win10SdkDir, `Lib/${Win10SdkVersion}/um`)
export async function DumpDllExtractWin2000Sp4(
  dllImportItem: DllImportItem,
): Promise<void> {
  const CabPath = path.join(
    Win200Sp4DirRaw,
    dllImportItem.name.toUpperCase() + '.DL_',
  )
  try {
    await fs.access(CabPath)
    const targetCabPath = path.join(dumpDllWorkDir, dllImportItem.name + '.cab')
    try {
      await fs.unlink(targetCabPath)
    } catch (error) {
      console.log('make sure  unlinked')
    }
    await fs.link(CabPath, targetCabPath)
  } catch (error) {
    console.log(`no ${CabPath}`)
  }
}
const ArchList = ['x86', 'x64', 'arm64', 'arm']

type ArchType = 'x86' | 'x64' | 'arm64' | 'arm'
async function DumpLibExportsWin10(
  dllImportItem: DllImportItem,
  arch: ArchType,
) {
  const libPath = path.join(Win10SdkDirLib, arch, dllImportItem.name + '.lib')
  try {
    await fs.access(libPath)
    const result = cp.spawnSync(DumpbinX86, ['/EXPORTS', libPath], {
      encoding: 'latin1',
    }).stdout
    return result
  } catch (error) {
    console.log(`no ${libPath}`)
  }
  return undefined
}

export async function DumpDllExportsWin2000Sp4(
  dllImportItem: DllImportItem,
): Promise<string | undefined> {
  const dllPath = path.join(Win200Sp4DirDll, dllImportItem.name + '.dll')
  try {
    await fs.access(dllPath)
    const result = cp.spawnSync(DumpbinX86, ['/EXPORTS', dllPath], {
      encoding: 'latin1',
    }).stdout
    return result
  } catch (error) {
    console.log(`no ${dllPath}`)
  }
  return undefined
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

// d3dcompiler.lib
export async function DumpDllExports(rootDir: string): Promise<void> {
  const dllImportList = (await readJson(
    path.join(rootDir, 'win-polyfill-dll-list.json'),
  )) as DllImportItem[]
  updateWinSdkLib(rootDir, dllImportList)
  return
  const allResult = []
  for (const dllImportItem of dllImportList) {
    const resultWin10Lib = await DumpLibExportsWin10(dllImportItem)
    // const result = await DumpDllExportsWin2000Sp4(dllImportItem)
    allResult.push(resultWin10Lib)
  }
  console.log(allResult.length)
}
