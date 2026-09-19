/**
 * 应用路径解析（D20：锚定应用根）
 *
 * 预编译后 import.meta.dirname 指向 dist/，而资源（assets/src/prompt/tools）
 * 不在其中。本模块用 app.getAppPath() 锚定"应用根"：
 *  - 开发时 = 项目根
 *  - 打包时 = asar 根
 * 从而与编译输出结构解耦。
 *
 * 注意：仅主进程可用（依赖 electron app）。preload 不用（它解析 dist 内产物）。
 */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// electron 特殊：其 index.js 导出字符串，须用 createRequire（见 P3a 手册 1.5）
const require = createRequire(import.meta.url);
const { app } = require('electron');

/** 应用根目录：开发=项目根，打包=asar 根 */
export const APP_ROOT: string = app.getAppPath();

/** 解析项目根资源（如 assets/icon.png） */
export function resolveAsset(rel: string): string {
  return path.join(APP_ROOT, rel);
}

/** 解析 src/ 下的非 TS 资源（如 prompt/*.md、ui/*.html） */
export function resolveSrc(rel: string): string {
  return path.join(APP_ROOT, 'src', rel);
}

/**
 * 解析工具 API 类型定义（tools/cuckoo-tools.d.ts）。
 * 打包后位于 resources/tools/（asar 外），开发时位于项目根 tools/。
 */
export function resolveToolSpec(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'tools', 'cuckoo-tools.d.ts'),
    path.join(APP_ROOT, 'tools', 'cuckoo-tools.d.ts'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return candidates[candidates.length - 1];
}
