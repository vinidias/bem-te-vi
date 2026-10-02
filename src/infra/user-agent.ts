/**
 * 动态生成"普通 Chrome" User-Agent。
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

/**
 * 生成普通 Chrome UA（去掉 Electron 标识，内核版本与真实一致）。
 * 格式对齐真实 Chrome：Chrome/{主版本}.0.0.0
 */
function buildChromeUserAgent(): string {
  const major = chromeMajor();
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + major + '.0.0.0 Safari/537.36';
}

export { buildChromeUserAgent, chromeMajor };
