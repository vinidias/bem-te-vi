/**
 * Cuckoo Code 主进程入口（薄壳）
 * 实现位于 src/main/（参见 src/main/index.js）。
 * 保留此文件以维持 package.json "main" 与既有加载路径不变。
 */
// 注册 tsx 的 ESM 钩子，使后续 import 能加载 .ts 文件。
// 开发环境：tsx 已装 → 钩子生效，可直接 import .ts。
// 生产环境：无 tsx → 跳过，加载编译后的 .js。
// 注意：必须用动态 import 保证钩子先于 src/main 注册（静态 import 会被提升）。
try {
  const { register } = await import('tsx/esm/api');
  register();
  console.log('[Cuckoo Code] TS 钩子已启用（tsx/esm）');
} catch (_) {
  console.log('[Cuckoo Code] TS 钩子未启用（生产构建，加载 .js）');
}
await import('./src/main/index.js');
