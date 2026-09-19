/**
 * Cuckoo Code preload 入口（薄壳）
 * 实现位于 src/preload/（参见 src/preload/index.js）。
 * 保留此文件以维持主进程 webPreferences.preload 的加载路径不变。
 */
// 注册 tsx 的 CJS 钩子，使后续 require 能加载 .ts 文件。
// 开发环境：钩子生效；生产环境：跳过，加载编译后的 .js。
try {
  require('tsx/cjs');
} catch (_) {
  // 无 tsx（生产构建），忽略
}
require('./src/preload');
