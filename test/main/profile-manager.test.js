import { test, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

// profile-manager 依赖 electron 的 app.getPath('userData')
const origLoad = Module._load;
const userDataDir = path.join(process.cwd(), 'test', 'tmp', 'profile-manager-test');

function installMock() {
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: (name) => name === 'userData' ? userDataDir : userDataDir,
          setPath: () => {},
        },
      };
    }
    return origLoad.apply(this, arguments);
  };
}
function uninstallMock() {
  Module._load = origLoad;
}

let pm;

beforeEach(async () => {
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  installMock();
  // profile-manager 有模块级缓存 PROFILE_FILE，用 resetModules + 动态 import 重新求值
  vi.resetModules();
  pm = await import('../../src/main/profile-manager.js');
});

afterEach(() => {
  uninstallMock();
  vi.resetModules();
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
});

test('readProfiles 初始为空数组', () => {
  assert.deepStrictEqual(pm.readProfiles(), []);
});

test('createProfile 创建带默认名称的 profile', () => {
  const p = pm.createProfile();
  assert.ok(p.id.startsWith('profile-'));
  assert.strictEqual(p.name, '窗口1');
  assert.strictEqual(p.partition, 'persist:' + p.id);
  assert.ok(p.createdAt);
});

test('createProfile 支持自定义名称', () => {
  const p = pm.createProfile('我的窗口');
  assert.strictEqual(p.name, '我的窗口');
});

test('getDefaultProfile 无 profile 时创建默认窗口', () => {
  const p = pm.getDefaultProfile();
  assert.strictEqual(p.name, '默认窗口');
});

test('getDefaultProfile 已有 profile 时返回第一个', () => {
  pm.createProfile('窗口A');
  pm.createProfile('窗口B');
  const p = pm.getDefaultProfile();
  assert.strictEqual(p.name, '窗口A');
});

test('getProfileById 查找', () => {
  const created = pm.createProfile('测试');
  assert.strictEqual(pm.getProfileById(created.id).name, '测试');
  assert.strictEqual(pm.getProfileById('nonexistent'), null);
});

test('updateProfileName 更新名称', () => {
  const created = pm.createProfile('旧名');
  const updated = pm.updateProfileName(created.id, '新名');
  assert.strictEqual(updated.name, '新名');
  assert.strictEqual(pm.getProfileById(created.id).name, '新名');
});

test('updateProfileName 不存在的 profile 返回 null', () => {
  assert.strictEqual(pm.updateProfileName('bad', 'x'), null);
});

test('profile 列表持久化到磁盘', () => {
  pm.createProfile('持久化测试');
  const file = path.join(userDataDir, 'profile-list.json');
  assert.ok(fs.existsSync(file));
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  assert.strictEqual(raw.length, 1);
  assert.strictEqual(raw[0].name, '持久化测试');
});
