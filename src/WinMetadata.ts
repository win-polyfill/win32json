// WinMetadata Schema

export const ArchList = ['x86', 'x64', 'arm64', 'arm'] as const

// const ArchList = ['x86']

export type ArchType = typeof ArchList[number]

export interface TypeInfo {
  Kind: string
  Name: string
  TargetKind: string
  Api: string
  Parents: TypeInfo[]
}

export interface ParamInfo {
  Name: string
  Type: TypeInfo
  Attrs: string[]
}

export interface ApiInformation {
  Index: number
  Platform?: string
  Module: string
  Name: string
  DllImport: string
  ReturnType: TypeInfo
  Params: ParamInfo[]
  Architectures: string[]
  // for patch only
  ForwardName?: string
}

export interface PlatformInfo {
  Platform: string
  Version: string
}

export interface FunctionInfo {
  Name: string
  Platform: string | null
  Module: string
  SetLastError: boolean
  DllImport: string
  ReturnType: TypeInfo
  ReturnAttrs: string[]
  Architectures: string[]
  // Attrs: string[] /* There is no function Attrs */
  Params: ParamInfo[]
}

export interface WinMetaApi {
  Functions: FunctionInfo[]
}
