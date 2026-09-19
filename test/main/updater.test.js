import { test, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert';
import Module from 'node:module';

// electron 在源码里用 createRequire 加载，vi.mock 拦不到，须 Module._load 打桩
const origLoad = Module._load;
function installElectronMock() {
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: { isPackaged: false, whenReady: () => Promise.resolve(), on: () => {}, quit: () => {} },
        dialog: { showMessageBox: async () => ({ response: 0 }) },
        Notification: { isSupported: () => false },
      };
    }
    return origLoad.apply(this, arguments);
  };
}
function uninstallElectronMock() { Module._load = origLoad; }

// electron-updater / electron-log 用 ESM import，vi.mock 拦截
const mocks = vi.hoisted(() => ({
  autoUpdater: {
    logger: null,
    autoDownload: true,
    autoInstallOnAppQuit: true,
    on: () => {},
    checkForUpdates: async () => {},
    downloadUpdate: async () => {},
    quitAndInstall: () => {},
  },
  fakeLog: {
    transports: { file: { level: '' } },
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
  },
}));

vi.mock('electron-updater', () => ({
  default: { autoUpdater: mocks.autoUpdater },
}));

vi.mock('electron-log', () => ({
  default: mocks.fakeLog,
}));

let updater;

beforeEach(async () => {
  installElectronMock();
  vi.resetModules();
  updater = await import('../../src/main/updater.js');
});

afterEach(() => {
  uninstallElectronMock();
  vi.resetModules();
});

test('isNetworkError 识别网络错误', () => {
  assert.strictEqual(updater.isNetworkError({ message: 'net::ERR_CONNECTION_REFUSED' }), true);
  assert.strictEqual(updater.isNetworkError({ message: 'ECONNREFUSED' }), true);
  assert.strictEqual(updater.isNetworkError({ message: 'ETIMEDOUT' }), true);
  assert.strictEqual(updater.isNetworkError({ message: 'socket hang up' }), true);
});

test('isNetworkError 非网络错误返回 false', () => {
  assert.strictEqual(updater.isNetworkError({ message: 'Cannot find latest.yml' }), false);
  assert.strictEqual(updater.isNetworkError({ message: 'unknown error' }), false);
  assert.strictEqual(updater.isNetworkError(null), false);
});

test('isGitHubAccessError 识别 GitHub 错误', () => {
  assert.strictEqual(updater.isGitHubAccessError({ message: 'HttpError: 404' }), true);
  assert.strictEqual(updater.isGitHubAccessError({ message: 'api.github.com rate limit' }), true);
  assert.strictEqual(updater.isGitHubAccessError({ message: 'forbidden' }), true);
});

test('isGitHubAccessError 非 GitHub 错误返回 false', () => {
  assert.strictEqual(updater.isGitHubAccessError({ message: 'ECONNREFUSED' }), false);
  assert.strictEqual(updater.isGitHubAccessError({ message: 'generic failure' }), false);
  assert.strictEqual(updater.isGitHubAccessError(null), false);
});

test('initAutoUpdater 开发环境不检查更新', () => {
  assert.doesNotThrow(() => updater.initAutoUpdater({ isDestroyed: () => false }));
});
