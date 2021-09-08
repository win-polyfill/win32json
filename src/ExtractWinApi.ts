import { assert } from 'console'
import path from 'path'
import { ArchList } from './WinMetadata'
import { readJson } from './WinMetaUtil'

/** Object Index are start at 1
 *
Microsoft (R) COFF/PE Dumper Version 14.29.30037.0
Copyright (C) Microsoft Corporation.  All rights reserved.


Dump of file C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.19041.0\\um\\x86\\icmui.lib

File Type: LIBRARY

Archive member name at 8: /
FFFFFFFF time/date
         uid
         gid
       0 mode
      D2 size
correct header end

    7 public symbols

      22E __IMPORT_DESCRIPTOR_ICMUI
      450 __NULL_IMPORT_DESCRIPTOR
      584 ICMUI_NULL_THUNK_DATA
      6D2 _SetupColorMatchingA@4
      6D2 __imp__SetupColorMatchingA@4
      744 _SetupColorMatchingW@4
      744 __imp__SetupColorMatchingW@4

Archive member name at 116: /
FFFFFFFF time/date
         uid
         gid
       0 mode
      DC size
correct header end

    5 offsets

        1      22E
        2      450
        3      584
        4      6D2
        5      744

    7 public symbols

        4 _SetupColorMatchingA@4
        5 _SetupColorMatchingW@4
        1 __IMPORT_DESCRIPTOR_ICMUI
        2 __NULL_IMPORT_DESCRIPTOR
        4 __imp__SetupColorMatchingA@4
        5 __imp__SetupColorMatchingW@4
        3 ICMUI_NULL_THUNK_DATA

Archive member name at 22E: ICMUI.DLL/
FFFFFFFF time/date
         uid
         gid
       0 mode
     1E5 size
correct header end

Archive member name at 450: ICMUI.DLL/
FFFFFFFF time/date
         uid
         gid
       0 mode
      F8 size
correct header end

Archive member name at 584: ICMUI.DLL/
FFFFFFFF time/date
         uid
         gid
       0 mode
     112 size
correct header end

Archive member name at 6D2: ICMUI.DLL/
FFFFFFFF time/date
         uid
         gid
       0 mode
      35 size
correct header end

Archive member name at 744: ICMUI.DLL/
FFFFFFFF time/date
         uid
         gid
       0 mode
      35 size
correct header end

  Summary

          BD .debug$S
          14 .idata$2
          14 .idata$3
           4 .idata$4
           4 .idata$5
           A .idata$6
*/

interface FunctionEntry {
  moduleName: string // dll or lib name
  isSdk: boolean
  arch: string

  indexInLib: number
  offsetInLib: number
  entrySizeInLib: number

  /**
   * such as
   * "Archive member name at DC13A: /2799           api-ms-win-core-namedpipe-ansi-l1-1-0.dll",
   * "Archive member name at 7254: RESUTILS.dll/   ",
   */
  dllName: string
  dllIndex: string
}

export enum WinSdkLibState {
  WinSdkLibStateParsePublicSymbols,
  WinSdkLibStateParseArchiveMember,
  WinSdkLibStateParseExports,
  WinSdkLibStateParseDone,
}

export interface WinLibEntry {
  index: number
  offset: number
  names: string[]
  objectIndex?: number
  objectName?: string // dll for shared library and .o for static library
  exportName?: string
  exportRaw?: string
  ordinal?: number
}

/**
 *
 * @param symbols
 * @param dump
 */
function parseWinSdk(
  symbols: Map<string, FunctionEntry[]>,
  dump: any,
  moduleName: string,
) {
  for (const arch of ArchList) {
    const archItems: string[] = dump.dump[arch]
    if (archItems.length > 7) {
      // console.log(archItems.length)
      assert(archItems[8] === 'Archive member name at 8: /               ')
      // console.log(archItems[18])
      let state = WinSdkLibState.WinSdkLibStateParsePublicSymbols
      let objectIndex = 1
      const offsetToEntryMap = new Map<string, WinLibEntry>()
      const nameToEntryMap = new Map<string, WinLibEntry>()
      for (let i = 18; i < archItems.length; ++i) {
        const entry = archItems[i]
        switch (state) {
          case WinSdkLibState.WinSdkLibStateParsePublicSymbols: {
            if (entry === '') {
              state = WinSdkLibState.WinSdkLibStateParseArchiveMember
              break
            }
            const trimmedSymbol = entry.trim()
            const [offsetString, name] = trimmedSymbol.split(' ')
            const offset = parseInt(offsetString, 16)
            let existEntry = offsetToEntryMap.get(offsetString.toLowerCase())
            if (existEntry) {
              existEntry.names.push(name)
            } else {
              existEntry = {
                index: objectIndex,
                offset: offset,
                names: [name],
              }
              offsetToEntryMap.set(offsetString.toLowerCase(), existEntry)
              objectIndex += 1
            }
            nameToEntryMap.set(name, existEntry)
            // parse public symbol
            console.log(`symbol: ${trimmedSymbol}`)
            break
          }
          case WinSdkLibState.WinSdkLibStateParseArchiveMember: {
            if (entry === '     Exports') {
              state = WinSdkLibState.WinSdkLibStateParseExports
              i += 3
              break
            } else if (entry === '  Summary') {
              state = WinSdkLibState.WinSdkLibStateParseDone
              break
            }
            // parse member
            console.log('member:' + entry)
            const memberPrefix = 'Archive member name at '
            assert(entry.startsWith(memberPrefix))
            const dllInformation = entry.slice(memberPrefix.length).trim()
            let [offsetString, objectString] = dllInformation.split(': ')
            offsetString = offsetString.trim()
            objectString = objectString.trim()
            let objectName = ''
            if (objectString.startsWith('/')) {
              const matches = objectString.split(/\s+/)
              const [objectIndexString, objectNameOrigin] = matches
              objectName = objectNameOrigin.trim()
              console.log(
                `archive member ${objectIndexString} with ${objectName}`,
              )
            } else {
              objectName = objectString.trim()
              if (objectName.search(' ') >= 0) {
                throw new Error(`${objectName} should not contains space`)
              }
              if (objectName.endsWith('/')) {
                objectName = objectName.slice(0, objectName.length - 1)
              }
            }

            const existEntry = offsetToEntryMap.get(offsetString.toLowerCase())
            if (existEntry) {
              existEntry.objectName = objectName
            } else if (!objectName.toLowerCase().endsWith('.obj')) {
              console.error(
                `${state} ${dump.name} - ${arch} module:${moduleName}-${i}`,
              )
              console.error(
                `Can not found ${offsetString} for objectName:'${objectName}' member ${entry}`,
              )
            }
            i += 7
            break
          }
          case WinSdkLibState.WinSdkLibStateParseExports: {
            if (entry === '') {
              state = WinSdkLibState.WinSdkLibStateParseDone
              break
            }
            console.log('export:' + `${entry}`)
            let ordinal: number | undefined
            let nameWithDetail: string
            if (entry.startsWith('                  ')) {
              nameWithDetail = entry.trim()
              ordinal = undefined
            } else {
              const trimmedEntry = entry.trim()
              const [ordinalString, nameWithDetailSplit] =
                trimmedEntry.split('    ')
              ordinal = parseInt(ordinalString)
              nameWithDetail = nameWithDetailSplit.trim()
            }
            const name = nameWithDetail.split(' ')[0]
            let exportRaw = name
            let existEntry = nameToEntryMap.get(name)
            if (!existEntry) {
              exportRaw = `__imp_${name}`
              existEntry = nameToEntryMap.get(exportRaw)
            }
            if (existEntry) {
              existEntry.exportName = name
              existEntry.exportRaw = exportRaw
              existEntry.ordinal = ordinal
            } else {
              console.error(
                `${state} ${dump.name} - ${arch} module:${moduleName}-${i}`,
              )
              console.error(
                `Can not found '${name}' ${nameWithDetail} for export ${entry}`,
              )
            }
            // parse export
            break
          }
          case WinSdkLibState.WinSdkLibStateParseDone:
            break
          default:
            break
        }
      }
      // console.log(JSON.stringify(Array.from(offsetToEntryMap.entries())))
    }
  }
}

function parseFunctions(x: any) {
  const name = x.name as string
  console.log(name)
  const symbols = new Map<string, FunctionEntry[]>()
  parseWinSdk(symbols, x.dump[0], name)
}

export async function ExtractWinApi(rootDir: string): Promise<void> {
  const dumpInfo = (await readJson(
    path.join(rootDir, 'win-polyfill-dll-dumps.json.txt'),
  )) as any[]
  console.log(dumpInfo.length)
  // eslint-disable-next-line no-unreachable-loop
  for (const x of dumpInfo) {
    parseFunctions(x)
    // break
  }
}
