'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { installElectronMock } = require('../helpers/mock-electron');

let restore;
const userDataDir = path.join(process.cwd(), 'test', 'tmp', 'userData');

beforeEach(() => {
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  restore = installElectronMock();
  delete require.cache[require.resolve('../../src/main/session-store')];
});

afterEach(() => {
  restore();
  delete require.cache[require.resolve('../../src/main/session-store')];
});

test('extractSessionIdFromUrl 标准 URL', () => {
  const store = require('../../src/main/session-store');
  const url = 'https://chat.deepseek.com/a/chat/s/bd9953b8-ff70-4207-9a12-5967be02a066';
  assert.strictEqual(store.extractSessionIdFromUrl(url), 'bd9953b8-ff70-4207-9a12-5967be02a066');
});

test('extractSessionIdFromUrl /s/ 备选', () => {
  const store = require('../../src/main/session-store');
  assert.strictEqual(store.extractSessionIdFromUrl('https://x.com/s/abc123'), 'abc123');
});

test('extractSessionIdFromUrl 无会话返回 null', () => {
  const store = require('../../src/main/session-store');
  assert.strictEqual(store.extractSessionIdFromUrl('https://chat.deepseek.com/'), null);
  assert.strictEqual(store.extractSessionIdFromUrl(null), null);
  assert.strictEqual(store.extractSessionIdFromUrl(''), null);
});

test('readSessionStore 不存在返回空对象', () => {
  const store = require('../../src/main/session-store');
  assert.deepStrictEqual(store.readSessionStore(), {});
});

test('write/readSessionStore 往返', () => {
  const store = require('../../src/main/session-store');
  store.writeSessionStore({ a: 'dir1' });
  assert.deepStrictEqual(store.readSessionStore(), { a: 'dir1' });
});

test('saveSessionDirMapping / getProjectDirBySessionId', () => {
  const store = require('../../src/main/session-store');
  store.saveSessionDirMapping('id1', 'C:/proj');
  assert.strictEqual(store.getProjectDirBySessionId('id1'), 'C:/proj');
  assert.strictEqual(store.getProjectDirBySessionId('missing'), null);
  assert.strictEqual(store.getProjectDirBySessionId(null), null);
});

test('saveSessionDirMapping 空 sessionId 不保存', () => {
  const store = require('../../src/main/session-store');
  store.saveSessionDirMapping('', 'C:/proj');
  assert.deepStrictEqual(store.readSessionStore(), {});
});

test('state 初始值', () => {
  const store = require('../../src/main/session-store');
  assert.strictEqual(store.state.currentSessionId, null);
  assert.strictEqual(store.state.selectedProjectDir, null);
  assert.strictEqual(store.state.pendingProjectDir, null);
});

test('handleUrlChange 非会话清空状态', () => {
  const windowState = require('../../src/main/window');
  const sent = [];
  windowState.setMainWindow({ isDestroyed: () => false, webContents: { send: (ch, data) => sent.push([ch, data]) } });
  const store = require('../../src/main/session-store');
  store.state.currentSessionId = 'old';
  store.state.selectedProjectDir = 'C:/old';
  store.handleUrlChange('https://chat.deepseek.com/');
  assert.strictEqual(store.state.currentSessionId, null);
  assert.strictEqual(store.state.selectedProjectDir, null);
  assert.ok(sent.some(([ch]) => ch === 'project-dir-updated'));
  windowState.setMainWindow(null);
});

test('handleUrlChange 恢复已保存目录', () => {
  const windowState = require('../../src/main/window');
  const sent = [];
  windowState.setMainWindow({ isDestroyed: () => false, webContents: { send: (ch, data) => sent.push([ch, data]) } });
  const store = require('../../src/main/session-store');
  store.saveSessionDirMapping('abc123', 'C:/proj');
  store.state.currentSessionId = null;
  store.handleUrlChange('https://chat.deepseek.com/a/chat/s/abc123');
  assert.strictEqual(store.state.currentSessionId, 'abc123');
  assert.strictEqual(store.state.selectedProjectDir, 'C:/proj');
  assert.ok(sent.some(([ch]) => ch === 'session-restored'));
  assert.ok(sent.some(([ch]) => ch === 'project-dir-updated'));
  windowState.setMainWindow(null);
});
