import fs from 'fs/promises'

export async function readJson(f: string): Promise<unknown> {
  let content = await fs.readFile(f, {
    encoding: 'utf-8',
  })
  // Catches EFBBBF (UTF-8 BOM) because the buffer-to-string
  // conversion translates it to FEFF (UTF-16 BOM).
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1)
  }
  return JSON.parse(content)
}

export function normalizePlatform(platform: string | null): string | null {
  if (platform === null) {
    return platform
  }
  platform = platform.toLowerCase()
  platform = platform.replace(/\s+/g, '')
  return platform
}

export function normalizeDllImport(dllImport: string): string {
  return dllImport.toLowerCase()
}
