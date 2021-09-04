import fs from "fs/promises";
import path from "path";

export interface ApiInformation {
  Index: number;
  Platform?: string;
  Module: string;
  Name: string;
  DllImport: string;
  ReturnType: TypeInfo;
  Params: ParamInfo[];
  Architectures: string[];
  // for patch only
  ForwardName?: string;
}
export interface TypeInfo {
  Kind: string;
  Name: string;
  TargetKind: string;
  Api: string;
  Parents: any[];
}
export interface ParamInfo {
  Name: string;
  Type: TypeInfo;
  Attrs: string[];
}
export interface FunctionInfo {
  Name: string;
  Module: string;
  SetLastError: boolean;
  DllImport: string;
  ReturnType: TypeInfo;
  ReturnAttrs: string[];
  Architectures: string[];
  Platform: string | null;
  // Attrs: string[] /* There is no function Attrs */
  Params: ParamInfo[];
}
const rootDir = path.join(__dirname, "..");

export async function unused1() {
  const content = await fs.readFile(path.join(rootDir, "symbols.txt"), "utf-8");
  const apis = content.split("\r\n");
  const aiiSet: ApiInformation[] = [];
  let index = 0;
  for (const api of apis) {
    index += 1;
    console.log(api);
    aiiSet.push({
      Index: index,
      Name: api,
      DllImport: "",
      Platform: "",
    } as ApiInformation);
  }
  fs.writeFile(
    path.join(rootDir, "win-polyfill.json"),
    JSON.stringify(aiiSet, null, 2)
  );
}

interface VersionInfo {
  major: number;
  minor: number;
  patch: number;
}

function parseVersion(version: string): VersionInfo {
  const v = version.split(".").map((x) => parseInt(x));
  return {
    major: v[0],
    minor: v[1],
    patch: v[2],
  };
}

async function readJson(f: string) {
  let content = await fs.readFile(f, {
    encoding: "utf-8",
  });
  // Catches EFBBBF (UTF-8 BOM) because the buffer-to-string
  // conversion translates it to FEFF (UTF-16 BOM).
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }
  return JSON.parse(content);
}

function normalizePlatform(platform: string | null) {
  if (platform === null) {
    return platform;
  }
  platform = platform.toLowerCase();
  platform = platform.replace(/\s+/g, "");
  return platform;
}

function normalizeDllImport(dllImport: string) {
  return dllImport.toLowerCase();
}

export async function loadWinApiMetadataPlatformSet() {
  const apiRoot = path.join(rootDir, "api");
  const files = await fs.readdir(apiRoot);
  const platformSet = new Set();
  for (let f of files) {
    const apiFile = path.join(apiRoot, f);
    // console.log(apiFile)
    const info = await readJson(apiFile);
    for (let f of info.Functions) {
      let platform = normalizePlatform(f.Platform);
      if (platform !== null) {
        platformSet.add(platform);
      }
    }
  }
  const list = [];
  console.log(Array.from(platformSet.keys()));
  for (let x of Array.from(platformSet.keys())) {
    list.push({
      Platform: x,
      Version: "0.0.0",
    });
  }
  console.log(JSON.stringify(list, null, 2));
}

async function loadApiSet(p: string) {
  // console.log(platformMap)
  const apiMap = new Map<string, ApiInformation>();
  const apiList: ApiInformation[] = await readJson(p);
  let maximalApiIndex = 0;
  for (let apiItem of apiList) {
    apiMap.set(apiItem.Name, apiItem);
    maximalApiIndex = Math.max(maximalApiIndex, apiItem.Index);
  }
  return {
    apiMap,
    apiList,
    maximalApiIndex,
  };
}


async function polyfillAll() {
  const platformList:any[] = await readJson(path.join(rootDir, "platform-set.json"));
  const PlatformsToSkip = platformList.slice(0, 5).map((x)=>x.Platform)
  console.log(PlatformsToSkip)
  const platformMap = new Map<string, VersionInfo>();
  for (let p of platformList) {
    platformMap.set(p.Platform, parseVersion(p.Version));
  }
  // console.log(platformMap)
  let { apiMap, apiList, maximalApiIndex } = await loadApiSet(
    path.join(rootDir, "win-polyfill.json")
  );
  console.log(maximalApiIndex);
  const patchApiSet = await loadApiSet(
    path.join(rootDir, "win-polyfill-patch.json")
  );

  const apiRoot = path.join(rootDir, "api");
  const allFunctions: FunctionInfo[] = [];
  const allFunctionsMap = new Map<string, FunctionInfo>();
  const files = await fs.readdir(apiRoot);
  for (let f of files) {
    const apiFile = path.join(apiRoot, f);
    // console.log(apiFile)
    const info = await readJson(apiFile);
    for (let fn of info.Functions as FunctionInfo[]) {
      allFunctions.push(fn);
      if (allFunctionsMap.has(fn.Name)) {
        console.log(`Duplicated ${fn.Name}`);
      } else {
        fn.Module = f.substr(0, f.length - ".json".length);
        allFunctionsMap.set(fn.Name, fn);
      }
    }
  }
  const DllImportSet = new Map<string, number>()
  for (let f of allFunctions) {
    let platform = normalizePlatform(f.Platform);
    let DllImport = normalizeDllImport(f.DllImport)
    if (!DllImportSet.has(DllImport)) {
      DllImportSet.set(DllImport, 0)
    }
    if (platform !== null && PlatformsToSkip.indexOf(platform) < 0) {
      if (!apiMap.has(f.Name)) {
        maximalApiIndex += 1;
        let newApi: ApiInformation = {
          Index: maximalApiIndex,
          Module: f.Module,
          Name: f.Name,
          Platform: platform,
          DllImport: DllImport
        } as ApiInformation;
        const existCount = DllImportSet.get(DllImport) ?? 0
        DllImportSet.set(DllImport, existCount + 1)
        apiList.push(newApi);
      }
    }
  }
  for (let existApi of apiList) {
    const patchApi = patchApiSet.apiMap.get(existApi.Name);
    let f = allFunctionsMap.get(existApi.Name);
    if (!f) {
      if (patchApi) {
        f = allFunctionsMap.get(patchApi.ForwardName!);
      }
      console.log(existApi.Name);
    }
    if (f) {
      let platform = normalizePlatform(f.Platform);
      existApi.Module = f.Module
      existApi.DllImport = normalizeDllImport(f.DllImport)
      if (platform !== null) {
        existApi.Platform = platform;
      }
      if (existApi.Platform === undefined) {
        console.log(existApi.Name);
      }
      existApi.ReturnType = f.ReturnType;
      existApi.Params = f.Params;
      existApi.Architectures = f.Architectures;
    }
    if (patchApi !== undefined) {
      if (patchApi.Platform) {
        existApi.Platform = patchApi.Platform;
      }
      if (patchApi.DllImport) {
        existApi.DllImport = normalizeDllImport(patchApi.DllImport);
      }
      if (patchApi.ReturnType) {
        existApi.ReturnType = patchApi.ReturnType;
      }
      if (patchApi.Params) {
        existApi.Params = patchApi.Params;
      }
      if (patchApi.Architectures) {
        existApi.Architectures = patchApi.Architectures;
      }
    }
  }
  fs.writeFile(
    path.join(rootDir, "win-polyfill.json"),
    JSON.stringify(apiList, null, 2)
  );
  const dllList = []
  const dllListSorted = Array.from(DllImportSet.entries()).sort()
  for (let [Name, Count] of dllListSorted) {
    dllList.push({
      Name,
      Count
    })
    if (Count > 0) {
      // console.log(`${Name} ${Count}`)
    }
  }
  fs.writeFile(path.join(rootDir,'win-polyfill-dll-list.json'), JSON.stringify(dllList, null, 2))
  console.log("done");
}

async function start() {
  await polyfillAll();
}

start();
