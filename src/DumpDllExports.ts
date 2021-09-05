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
export const Win2000Sp4DirRaw = path.join(WinPolyfillRoot, 'Windows2000-SP4')
const Win2000Sp4DirDll = path.join(WinPolyfillRoot, 'Windows2000-SP4-Dll')
const Win10RtmDirDll = path.join(WinPolyfillRoot, 'Windows10-RTM-Dll')
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
  args: string[]
  dump: Record<string, string[]>
}

export async function DumpBinaryForItem(
  filesToDump: DumpBinaryItem[],
  dllImportItem: DllImportItem,
): Promise<void> {
  const promises: Promise<string[]>[] = []
  filesToDump.forEach((item: DumpBinaryItem) => {
    ArchList.forEach((arch) => {
      const promiseDump = DumpBin(
        path.join(item.path, arch, dllImportItem.name + item.suffix),
        item.args,
      ).then((x) => (item.dump[arch] = x))
      promises.push(promiseDump)
    })
  })
  await Promise.all(promises)
}

export async function DumpBinarySdkFiles(
  rootDir: string,
  dllImportList: DllImportItem[],
): Promise<void> {
  const dumpList = []
  for (const dllImportItem of dllImportList) {
    const dumpItem: DumpBinaryItem[] = [
      {
        name: 'Win10Sdk',
        path: Win10SdkDirLib,
        suffix: '.lib',
        args: ['/ALL', '/RAWDATA:NONE'],
        dump: {},
      },
    ]
    await DumpBinaryForItem(dumpItem, dllImportItem)
    dumpList.push({
      name: dllImportItem.name,
      hasLib: dllImportItem.hasLib,
      dump: dumpItem,
    })
    console.log(`Dumped lib for ${dllImportItem.name}`)
  }
  const libDumpsPath = path.join(rootDir, `win-polyfill-lib-dumps.json.txt`)
  await fs.writeFile(libDumpsPath, JSON.stringify(dumpList, null, 2))
  console.log(`Dump lib done`)
}

export async function DumpBinaryFiles(
  rootDir: string,
  dllImportList: DllImportItem[],
): Promise<void> {
  const dumpList = []
  for (const dllImportItem of dllImportList) {
    const dumpItem: DumpBinaryItem[] = [
      {
        name: 'Win2000Sp4',
        path: Win2000Sp4DirDll,
        suffix: '.dll',
        args: ['/EXPORTS'],
        dump: {},
      },
      {
        name: 'Win10Rtm',
        path: Win10RtmDirDll,
        suffix: '.dll',
        args: ['/EXPORTS'],
        dump: {},
      },
    ]
    await DumpBinaryForItem(dumpItem, dllImportItem)
    dumpList.push({
      name: dllImportItem.name,
      hasLib: dllImportItem.hasLib,
      dump: dumpItem,
    })
    console.log(`Dumped dll for ${dllImportItem.name}`)
  }

  const dllDumpsPath = path.join(rootDir, `win-polyfill-dll-dumps.json.txt`)
  await fs.writeFile(dllDumpsPath, JSON.stringify(dumpList, null, 2))
  console.log(`Dump dll done`)
}

// d3dcompiler.lib
export async function DumpDllExports(rootDir: string): Promise<void> {
  const dllImportList = (await readJson(
    path.join(rootDir, 'win-polyfill-dll-list.json'),
  )) as DllImportItem[]
  // updateWinSdkLib(rootDir, dllImportList)
  // DumpDllExtract(Win2000Sp4DirRaw, dumpDllWorkDir, dllImportList)

  /*
  DumpDllExtract(
    path.join(WinPolyfillRoot, 'Windows10-RTM-Dll-Raw', 'x64'),
    dumpDllWorkDir,
    dllImportList,
  )
  */

  DumpBinarySdkFiles(rootDir, dllImportList)
  DumpBinaryFiles(rootDir, dllImportList)
}

// dumpbin /ALL /RAWDATA:NONE "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib" >C:\work\out.txt

// dumpbin /SYMBOLS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib" >C:\work\out-symbols.txt

// dumpbin /EXPORTS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib" >C:\work\out-symbols.txt

// dumpbin /RELOCATIONS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib" >C:\work\out-symbols.txt
// dumpbin /RELOCATIONS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib" >C:\work\out-symbols.txt
// dumpbin /RELOCATIONS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib" >C:\work\out-symbols.txt
// dumpbin /SYMBOLS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib" >C:\work\out-symbols.txt
// dumpbin /DIRECTIVES "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib" >C:\work\out-symbols.txt

// dumpbin /ARCHIVEMEMBERS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib" >C:\work\out-symbols.txt

// dumpbin /ARCHIVEMEMBERS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib" >C:\work\out-symbols.txt

// dumpbin /ARCHIVEMEMBERS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib" >C:\work\out-symbols.txt
// dumpbin /DEPENDENTS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib" >C:\work\out-symbols.txt

// dumpbin "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib" /DEPENDENTS >C:\work\out-symbols.txt
/**
 * 
   dumpbin  /ALL /RAWDATA:NONE "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
   dumpbin  /ALL /RAWDATA:NONE "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\netlib.lib"  >C:\work\out-symbols.txt
   
   dumpbin  /ARCHIVEMEMBERS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
      /CLRHEADER "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
   dumpbin     /DEPENDENTS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
     dumpbin   /DIRECTIVES "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
      /DISASM[:{BYTES|NOBYTES}] "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
      /ERRORREPORT:{NONE|PROMPT|QUEUE|SEND} "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
dumpbin        /EXPORTS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
dumpbin        /FPO "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
      dumpbin  /HEADERS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
      /IMPORTS[:filename] "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
      /LINENUMBERS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
      /LINKERMEMBER[:{1|2}] "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
    dumpbin    /LOADCONFIG "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
      /NOLOGO "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
      /OUT:filename "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
   dumpbin     /PDATA "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
      /PDBPATH[:VERBOSE] "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
      /RANGE:vaMin[,vaMax] "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
      /RAWDATA[:{NONE|1|2|4|8}[,#]] "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
   dumpbin     /RELOCATIONS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
      /SECTION:name "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
    dumpbin    /SUMMARY "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
    dumpbin    /SYMBOLS "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt
      /TLS
   dumpbin     /UNWINDINFO "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\kernel32.Lib"  >C:\work\out-symbols.txt

 */
