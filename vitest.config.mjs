import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Electron 主进程 / preload 测试运行在 Node 环境
    environment: 'node',
    // 每个测试文件在独立子进程中运行：这些测试会操作 process.argv / process.type /
    // console / 全局 mock，进程级隔离最干净
    pool: 'forks',
    include: ['test/**/*.test.js'],
    // test/_legacy/：深度 mock 的旧测试（依赖 Module._load/vi.mock 内部模块），
    // 按 D21 暂缓——重构完成后按新结构重写。详见 test/_legacy/README.md
    exclude: ['test/_legacy/**', 'node_modules/**'],
    // 显式导入 vitest API，不用全局注入
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
  },
});
