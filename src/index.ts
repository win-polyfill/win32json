import fs from 'fs/promises'
import path from 'path';

interface ApiInformation {
    Index: number
    Platform: string,
    PlatformPolyfill: string,
    Name: string,
    DllImport: string,
}

export async function unused1() {
    const content = await fs.readFile(path.join(__dirname, '..', 'symbols.txt'), 'utf-8')
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
    fs.writeFile(path.join(__dirname, '..', 'win-polyfill.json'), JSON.stringify(aiiSet, null, 2))
}

function start() {
    const content = await fs.readFile(path.join(__dirname, '..', 'symbols.txt'), 'utf-8')

}

start()