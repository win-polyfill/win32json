import fs from 'fs/promises'
import path from 'path';

interface ApiInformation {
    Index: number
    Platform: string,
    PlatformPolyfill: string,
    Name: string,
    DllImport: string,
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
            PlatformPolyfill: '',
            Platform: '',
        })
    }
    fs.writeFile(path.join(rootDir, 'win-polyfill.json'), JSON.stringify(aiiSet, null, 2))
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

async function loadWinApiMetadata() {
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

async function start() {
    const apiList = await readJson(path.join(rootDir, 'win-polyfill.json'))
    console.log(apiList)
    await loadWinApiMetadata();
}

start()
