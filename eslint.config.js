// ESLint 配置（flat config，ESLint 9+）
// 目的：固化模块依赖方向（见 docs/refactor/01-architecture.md 第 3 节）
import js from '@eslint/js';
import noRestrictedRequires from './eslint-rules/no-restricted-requires.js';

// 依赖护栏（P2 先配"现状目录"，P4 重组后按目标结构重配）
const DEPENDENCY_ZONES = [
  // tools/ 不得反向依赖 src/main/（上层）
  {
    target: 'tools',
    from: 'src/main',
    except: ['mcp-client'], // 现状豁免（路径不带 .js），P4 解耦后移除
    reason: 'tools 不得依赖主进程，应在 P4 解耦',
  },
];

// 通用全局（Node + 浏览器，覆盖全项目 JS）
const COMMON_GLOBALS = {
  require: 'readonly', module: 'readonly', exports: 'readonly',
  process: 'readonly', console: 'readonly', Buffer: 'readonly',
  __dirname: 'readonly', __filename: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly', clearImmediate: 'readonly',
  setImmediate: 'readonly', queueMicrotask: 'readonly',
  global: 'readonly', globalThis: 'readonly',
  window: 'readonly', document: 'readonly', navigator: 'readonly',
  localStorage: 'readonly', fetch: 'readonly', URL: 'readonly',
  AbortController: 'readonly', AbortSignal: 'readonly',
  MutationObserver: 'readonly', Event: 'readonly', CustomEvent: 'readonly',
  TextDecoder: 'readonly', TextEncoder: 'readonly',
  URLSearchParams: 'readonly', Headers: 'readonly', Response: 'readonly', Request: 'readonly',
  structuredClone: 'readonly',
};

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'dist-verify/**', 'out/**', 'build/**', 'wyp/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      // 迁移期：模块模式（兼容 ESM import/export 与 CJS require；
      // require 未定义由 no-undef:off 兜底）
      sourceType: 'module',
      globals: COMMON_GLOBALS,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 以下三条为遗留代码的历史问题，P2 先关闭以保证基线干净；
      // P5（TS 迁移后）再开启并逐个修复。
      'no-undef': 'off',
      'no-useless-escape': 'off',
      'no-func-assign': 'off',
      // ESLint 10 新增规则，暴露遗留问题；P2 先关闭，P5 再逐个修复。
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
    },
  },
  {
    // 依赖护栏只作用于 src / tools
    files: ['src/**/*.js', 'tools/**/*.js'],
    plugins: { local: noRestrictedRequires },
    rules: {
      'local/no-restricted-requires': ['error', { zones: DEPENDENCY_ZONES }],
    },
  },
  {
    // ESLint 规则文件自身用 ESM/CJS 混合，跳过部分检查
    files: ['eslint-rules/**/*.js'],
    rules: { 'no-unused-vars': 'off' },
  },
];
