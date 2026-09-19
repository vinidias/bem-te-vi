/**
 * Cuckoo Code preload 入口（薄壳）
 * 实现位于 src/preload/（参见 src/preload/index.js）。
 * 保留此文件以维持主进程 webPreferences.preload 的加载路径不变。
 */
// 注意：Electron 用 require() 加载 preload，不能含顶层 await
// （require 不支持带 TLA 的 ESM）。当前 preload 图全是 .js，无需 tsx 钩子。
// P3b 迁 TS 时需改用 Electron ESM preload（.mjs）或其他机制。
import './src/preload/index.js';
