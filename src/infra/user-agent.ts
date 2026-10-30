/**
 * 动态生成"普通 Chrome" User-Agent 及客户端提示（Client Hints）。
 *
 * 背景：Electron 内嵌浏览器若 UA 与真实内核版本不一致（如写死 Chrome 130，
 * 实际内核是 Chrome 152），Google 等站点会因 UA/sec-ch-ua 矛盾判定"浏览器不安全"，
 * 拒绝登录。故改为从 process.versions.chrome 动态取真实版本。
 *
 * 主进程可用（依赖 process.versions）。preload 不用。
 */

/** 取主版本号（如 "152.0.7977.130" → "152"） */
function chromeMajor(): string {
  const v = (process.versions && process.versions.chrome) || '';
  const m = v.match(/^(\d+)/);
  return m ? m[1] : '0';
}

/** 平台档案：UA 平台串 / Client Hints 平台 / userAgentData 平台等 */
interface PlatformProfile {
  /** UA 括号内的平台串（对齐 Chromium 源码的编译期常量） */
  uaPlatform: string;
  /** sec-ch-ua-platform 的值（带引号） */
  chUaPlatform: string;
  /** navigator.userAgentData.platform */
  uadPlatform: string;
  /** getHighEntropyValues 的 platformVersion */
  platformVersion: string;
  /** getHighEntropyValues 的 architecture（"x86" | "arm"） */
  architecture: string;
  /** getHighEntropyValues 的 bitness（"64" | "32"） */
  bitness: string;
}

/**
 * 按当前平台返回 UA 档案。
 *
 * 平台串取自 Chromium 源码 components/embedder_support/user_agent_utils.cc
 * 的编译期常量（UA Reduction 后的冻结值）——Chrome 故意不把真实系统版本写进 UA：
 * Apple Silicon Mac 也报 "Intel Mac OS X 10_15_7"，Windows 11 也报 "Windows NT 10.0"。
 * 真实系统信息只出现在 Client Hints / getHighEntropyValues 里。
 *
 * @param platform 平台标识，默认 process.platform（测试时可注入）
 * @param arch 架构标识，默认 process.arch（测试时可注入）
 */
function getPlatformProfile(
  platform: string = (typeof process !== 'undefined' && process.platform) || 'win32',
  arch: string = (typeof process !== 'undefined' && process.arch) || 'x64'
): PlatformProfile {
  switch (platform) {
    case 'darwin':
      return {
        uaPlatform: 'Macintosh; Intel Mac OS X 10_15_7',
        chUaPlatform: '"macOS"',
        uadPlatform: 'macOS',
        // 真实 Chrome 会调系统 API 取 macOS 版本；此处给常见固定值（高熵值极少被严格校验）
        platformVersion: '13.6.0',
        architecture: arch === 'arm64' ? 'arm' : 'x86',
        bitness: '64',
      };
    case 'linux':
      return {
        uaPlatform: 'X11; Linux x86_64',
        chUaPlatform: '"Linux"',
        uadPlatform: 'Linux',
        // 真实 Chrome 在 Linux 上此项返回空串
        platformVersion: '',
        architecture: 'x86',
        bitness: '64',
      };
    default: // win32
      return {
        uaPlatform: 'Windows NT 10.0; Win64; x64',
        chUaPlatform: '"Windows"',
        uadPlatform: 'Windows',
        platformVersion: '10.0.0',
        architecture: 'x86',
        bitness: '64',
      };
  }
}

/**
 * 生成普通 Chrome UA（去掉 Electron 标识，内核版本与真实一致）。
 * 格式对齐真实 Chrome：Chrome/{主版本}.0.0.0
 */
function buildChromeUserAgent(platform?: string, arch?: string): string {
  const major = chromeMajor();
  const p = getPlatformProfile(platform, arch);
  return 'Mozilla/5.0 (' + p.uaPlatform + ') AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + major + '.0.0.0 Safari/537.36';
}

/** 取完整内核版本（如 "152.0.7977.130"） */
function chromeFullVersion(): string {
  const v = (process.versions && process.versions.chrome) || '';
  return v || (chromeMajor() + '.0.0.0');
}

/**
 * 生成与 UA 匹配的 Chrome 客户端提示请求头（Sec-CH-UA*）。
 *
 * 为什么需要：Electron 默认发的 sec-ch-ua 缺少 "Google Chrome" 品牌，
 * Google 据此判定"浏览器或应用不安全"而拒绝登录。按真实 Chrome 补齐。
 */
function buildClientHintsHeaders(platform?: string, arch?: string): Record<string, string> {
  const m = chromeMajor();
  const p = getPlatformProfile(platform, arch);
  return {
    'sec-ch-ua': '"Google Chrome";v="' + m + '", "Chromium";v="' + m + '", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': p.chUaPlatform,
  };
}

/**
 * 生成修正 navigator.userAgentData / webdriver 的主世界脚本。
 * 必须在页面脚本之前注入（preload 阶段），否则会被页面抢先读到 Electron 默认值。
 */
function buildUserAgentDataFix(platform?: string, arch?: string): string {
  const m = chromeMajor();
  const full = chromeFullVersion();
  const p = getPlatformProfile(platform, arch);
  const uadPlatform = JSON.stringify(p.uadPlatform);
  const platformVersion = JSON.stringify(p.platformVersion);
  return '(function(){try{' +
    'var brands=[{brand:"Google Chrome",version:"' + m + '"},{brand:"Chromium",version:"' + m + '"},{brand:"Not_A Brand",version:"24"}];' +
    'var fullList=[{brand:"Google Chrome",version:"' + full + '"},{brand:"Chromium",version:"' + full + '"},{brand:"Not_A Brand",version:"24.0.0.0"}];' +
    'var uad={brands:brands,mobile:false,platform:' + uadPlatform + ',' +
    'getHighEntropyValues:function(){return Promise.resolve({architecture:"' + p.architecture + '",bitness:"' + p.bitness + '",brands:brands,fullVersionList:fullList,mobile:false,model:"",platform:' + uadPlatform + ',platformVersion:' + platformVersion + ',uaFullVersion:"' + full + '",wow64:false});},' +
    'toJSON:function(){return{brands:brands,mobile:false,platform:' + uadPlatform + '};}};' +
    'try{Object.defineProperty(navigator,"userAgentData",{get:function(){return uad;},configurable:true});}catch(e){}' +
    'try{Object.defineProperty(navigator,"webdriver",{get:function(){return false;},configurable:true});}catch(e){}' +
    '}catch(e){}})();';
}

export { buildChromeUserAgent, chromeMajor, buildClientHintsHeaders, buildUserAgentDataFix, getPlatformProfile };
