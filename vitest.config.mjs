import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Electron 主进程 / preload 测试运行在 Node 环境
    environment: 'node',
    // 每个测试文件在独立子进程中运行：这些测试会操作 process.argv / process.type /
    // console / 全局 mock，进程级隔离最干净
    pool: 'forks',
    include: ['test/**/*.test.js'],
    exclude: ['node_modules/**'],
    // 显式导入 vitest API，不用全局注入
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
  },
});
