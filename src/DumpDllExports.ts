interface DllImportStat {
  totalCount: number
  polyfillCount: number
}

interface DllImportItem extends DllImportStat {
  name: string
}

async function DumpDllExports(rootDir: string) {}
