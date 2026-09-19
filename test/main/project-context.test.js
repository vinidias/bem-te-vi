import { test, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { installElectronMock } from '../helpers/mock-electron.js';
installElectronMock();

const tmpRoot = path.join(process.cwd(), 'test', 'tmp', 'tree');

beforeEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, 'node_modules'), { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, '.git'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'README.md'), '');
  fs.writeFileSync(path.join(tmpRoot, 'src', 'a.js'), '');
  fs.writeFileSync(path.join(tmpRoot, 'node_modules', 'x.js'), '');
  fs.writeFileSync(path.join(tmpRoot, '.git', 'HEAD'), '');
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// 相关导出已从 src/main/project-context.js 移除（提交 a8a59df），
// getDirectoryTree / IGNORED_DIRS 的测试暂时注释。
// 保留一个占位测试，确保模块可正常加载、文件成为有效测试套件。

test('project-context 模块可加载且导出 PROMPT_DIR', async () => {
  const mod = await import('../../src/main/project-context.js');
  assert.strictEqual(typeof mod.PROMPT_DIR, 'string');
  assert.strictEqual(typeof mod.initProject, 'function');
});
