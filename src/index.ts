import fs from 'fs/promises'
import path from 'path';

export interface ApiInformation {
    Index: number
    Platform: string
    Name: string
    DllImport: string
    ReturnType: TypeInfo
    Params: TypeInfo[]
}
export interface TypeInfo {
    Kind: string
    Name: string
    TargetKind: string
    Api: string
    Parents: any []
}
export interface FunctionInformation {
    Name: string
    SetLastError: boolean
    DllImport: string
    ReturnType: TypeInfo
    ReturnAttrs: any[]
    Architectures: any[]
    Platform: string | null
    Attrs: any[]
    Params: TypeInfo[]
}
const rootDir = path.join(__dirname, '..')

export async function unused1() {
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
            Platform: ''
        } as ApiInformation)
    }
    fs.writeFile(path.join(rootDir, 'win-polyfill.json'), JSON.stringify(aiiSet, null, 2))
}

interface VersionInfo {
    major: number
    minor: number
    patch: number
}

function parseVersion(version: string): VersionInfo {
    const v = version.split('.').map(x => parseInt(x))
    return {
        major: v[0],
        minor: v[1],
        patch: v[2]
    }
}

async function readJson(f: string) {
    let content = await fs.readFile(f, {
        encoding: 'utf-8',
    });
    	// Catches EFBBBF (UTF-8 BOM) because the buffer-to-string
	// conversion translates it to FEFF (UTF-16 BOM).
	if (content.charCodeAt(0) === 0xFEFF) {
		content = content.slice(1);
	}
    return JSON.parse(content)
}

function normalizePlatform(platform: string | null) {
    if (platform === null) {
        return platform
    }
    platform = platform.toLowerCase()
    platform = platform.replace(/\s+/g, '');
    return platform
}

export async function loadWinApiMetadataPlatformSet() {
    const apiRoot = path.join(rootDir, 'api')
    const files = await fs.readdir(apiRoot)
    const platformSet = new Set()
    for (let f of files) {
        const apiFile = path.join(apiRoot, f)
        // console.log(apiFile)
        const info = await readJson(apiFile)
        for (let f of info.Functions) {
            let platform = normalizePlatform(f.Platform)
            if (platform !== null) {
                platformSet.add(platform)
            }
        }
    }
    const list = []
    console.log(Array.from(platformSet.keys()))
    for (let x of Array.from(platformSet.keys())) {
        list.push({
            Platform: x,
            Version: '0.0.0'
        })
    }
    console.log(JSON.stringify(list, null, 2))
}

async function loadApiSet(p: string) {
    // console.log(platformMap)
    const apiMap = new Map<string, ApiInformation>()
    const apiList: ApiInformation[] = await readJson(p)
    let maximalApiIndex = 0
    for (let apiItem of apiList) {
        apiMap.set(apiItem.Name, apiItem)
        maximalApiIndex = Math.max(maximalApiIndex, apiItem.Index)
    }
    return {
        apiMap,
        apiList,
        maximalApiIndex
    }
}

async function polyfillAll() {
    const platformList = await readJson(path.join(rootDir, 'platform-set.json'))
    const platformMap = new Map<string, VersionInfo>()
    for (let p of platformList) {
        platformMap.set(p.Platform, parseVersion(p.Version))
    }
    // console.log(platformMap)
    const { apiMap, apiList, maximalApiIndex } = await loadApiSet(path.join(rootDir, 'win-polyfill.json'))
    console.log(maximalApiIndex)
    const patchApiSet = await loadApiSet(path.join(rootDir, 'win-polyfill-guess.json'))

    const apiRoot = path.join(rootDir, 'api')
    const files = await fs.readdir(apiRoot)
    for (let f of files) {
        const apiFile = path.join(apiRoot, f)
        // console.log(apiFile)
        const info = await readJson(apiFile)
        for (let f of info.Functions as FunctionInformation[]) {
            let platform = normalizePlatform(f.Platform)
            const existApi = apiMap.get(f.Name)
            if (existApi) {
                if (!existApi.DllImport) {
                    existApi.DllImport = f.DllImport.toLowerCase()
                }
                if (platform !== null) {
                    existApi.Platform = platform
                }
                const patchApi = patchApiSet.apiMap.get(f.Name)
                if (patchApi !== undefined) {
                    existApi.Platform = patchApi.Platform;
                }
                if (existApi.Platform === undefined || existApi.Platform === '') {
                    console.log(existApi.Name)
                }
                existApi.ReturnType = f.ReturnType
                existApi.Params = f.Params
            }
        }
    }
    fs.writeFile(path.join(rootDir, 'win-polyfill.json'), JSON.stringify(apiList, null, 2))
}

async function start() {
    await polyfillAll();
}

start()
