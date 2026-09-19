import { test, afterAll, vi } from 'vitest';
import assert from 'node:assert';

// ===== 可观测 mock（vi.mock 工厂需在 hoist 前定义引用对象）=====
const mocks = vi.hoisted(() => ({
  sent: [],
  toasts: [],
  store: new Map(),
}));

vi.mock('../../src/preload/overlay/ui.js', () => ({
  showToast: (m) => { mocks.toasts.push(m); },
}));

vi.mock('../../src/preload/dom/chat-input.js', () => ({
  sendToChat: (msg, tag) => { mocks.sent.push({ msg, tag }); return true; },
}));

vi.mock('../../src/providers/index.js', () => ({
  getProviderByUrl: () => ({
    extractSessionId: (s) => {
      const m = String(s).match(/\/chat\/s\/([a-zA-Z0-9-]+)/);
      return m ? m[1] : null;
    },
  }),
}));

// ===== 全局桩（window/localStorage/定时器）=====
let timers = [];
let url = 'https://chat.deepseek.com/a/chat/s/sess-A';

function installGlobals() {
  global.window = {
    get location() { return { href: url }; },
  };
  global.localStorage = {
    getItem: (k) => (mocks.store.has(k) ? mocks.store.get(k) : null),
    setItem: (k, v) => mocks.store.set(k, String(v)),
    removeItem: (k) => mocks.store.delete(k),
    clear: () => mocks.store.clear(),
  };
  global.setTimeout = (fn, ms) => { const t = { fn, ms, type: 'timeout' }; timers.push(t); return t; };
  global.clearTimeout = (t) => { timers = timers.filter((x) => x !== t); };
  global.setInterval = (fn, ms) => { const t = { fn, ms, type: 'interval' }; timers.push(t); return t; };
  global.clearInterval = (t) => { timers = timers.filter((x) => x !== t); };
}

function reset() {
  mocks.sent.length = 0; mocks.toasts.length = 0;
  mocks.store.clear(); timers = [];
  url = 'https://chat.deepseek.com/a/chat/s/sess-A';
}

async function loadWd() {
  vi.resetModules();
  return await import('../../src/preload/dom/tool-loop-watchdog.js');
}

function lastTimeout() {
  const ts = timers.filter((t) => t.type === 'timeout');
  return ts[ts.length - 1];
}

installGlobals();

test('readConfig 默认值', async () => {
  reset();
  const cfg = (await loadWd())._readConfig();
  assert.strictEqual(cfg.timeout, 300000);
  assert.strictEqual(cfg.prompt, '请继续');
  assert.strictEqual(cfg.count, 3);
});

test('readConfig 读取 localStorage', async () => {
  reset();
  mocks.store.set('cuckoo-xhr-idle-timeout', '1234');
  mocks.store.set('cuckoo-watchdog-prompt', '继续呀');
  mocks.store.set('cuckoo-watchdog-count', '5');
  const cfg = (await loadWd())._readConfig();
  assert.strictEqual(cfg.timeout, 1234);
  assert.strictEqual(cfg.prompt, '继续呀');
  assert.strictEqual(cfg.count, 5);
});

test('未进入工具循环时，onMessageSent 不开看门狗', async () => {
  reset();
  const wd = await loadWd();
  wd.onMessageSent();
  assert.strictEqual(timers.length, 0);
});

test('检测到工具调用后，onMessageSent 会开看门狗', async () => {
  reset();
  const wd = await loadWd();
  wd.onToolCallDetected();
  wd.onMessageSent();
  assert.ok(lastTimeout(), '应有一个看门狗定时器');
});

test('收到终态回复会关看门狗', async () => {
  reset();
  const wd = await loadWd();
  wd.onToolCallDetected();
  wd.onMessageSent();
  assert.ok(lastTimeout());
  wd.onResponseReceived('finished');
  assert.strictEqual(timers.filter((t) => t.type === 'timeout').length, 0);
});

test('exitToolLoop 退出循环并清计数', async () => {
  reset();
  const wd = await loadWd();
  wd.onToolCallDetected();
  wd.exitToolLoop();
  wd.onMessageSent();
  assert.strictEqual(timers.length, 0, '退出循环后不再开看门狗');
});

test('超时且会话一致：发提示词', async () => {
  reset();
  const wd = await loadWd();
  wd.onToolCallDetected();
  wd.onMessageSent();
  const t = lastTimeout();
  t.fn();
  assert.strictEqual(mocks.sent.length, 1);
  assert.strictEqual(mocks.sent[0].msg, '请继续');
  assert.strictEqual(mocks.sent[0].tag, '看门狗');
});

test('超时但会话已切换：不发提示词', async () => {
  reset();
  const wd = await loadWd();
  wd.onToolCallDetected();
  wd.onMessageSent();
  const t = lastTimeout();
  url = 'https://chat.deepseek.com/a/chat/s/sess-B';
  t.fn();
  assert.strictEqual(mocks.sent.length, 0, '会话已切换，不应发提示词');
});

test('超时次数达上限后停止', async () => {
  reset();
  mocks.store.set('cuckoo-watchdog-count', '2');
  const wd = await loadWd();
  wd.onToolCallDetected();
  wd.onMessageSent();
  lastTimeout().fn();
  wd.onMessageSent();
  lastTimeout().fn();
  wd.onMessageSent();
  const before = mocks.sent.length;
  lastTimeout().fn();
  assert.strictEqual(mocks.sent.length, before, '达上限后不再发送');
  assert.ok(mocks.toasts.some((s) => /上限/.test(s)));
});

test('成功回复重置超时计数', async () => {
  reset();
  mocks.store.set('cuckoo-watchdog-count', '2');
  const wd = await loadWd();
  wd.onToolCallDetected();
  wd.onMessageSent();
  lastTimeout().fn();
  wd.onResponseReceived('finished');
  wd.onMessageSent();
  lastTimeout().fn();
  wd.onMessageSent();
  const before = mocks.sent.length;
  lastTimeout().fn();
  assert.ok(mocks.sent.length > before, '成功后计数重置，应能继续发');
});

test('负数次数表示无限，不因上限停止', async () => {
  reset();
  mocks.store.set('cuckoo-watchdog-count', '-1');
  const wd = await loadWd();
  wd.onToolCallDetected();
  for (let i = 0; i < 10; i++) {
    wd.onMessageSent();
    lastTimeout().fn();
  }
  assert.strictEqual(mocks.sent.length, 10, '无限模式每次都发');
});

test('超时时间 <=0 时禁用看门狗', async () => {
  reset();
  mocks.store.set('cuckoo-xhr-idle-timeout', '0');
  const wd = await loadWd();
  wd.onToolCallDetected();
  wd.onMessageSent();
  assert.strictEqual(timers.filter((t) => t.type === 'timeout').length, 0);
});

test('startSessionWatcher 检测到会话切换后重置', async () => {
  reset();
  const wd = await loadWd();
  wd.onToolCallDetected();
  wd.onMessageSent();
  wd.startSessionWatcher();
  const iv = timers.find((t) => t.type === 'interval');
  assert.ok(iv, '应启动轮询');
  url = 'https://chat.deepseek.com/a/chat/s/sess-B';
  iv.fn();
  assert.strictEqual(wd._isInLoop(), false);
});

test('startSessionWatcher 幂等', async () => {
  reset();
  const wd = await loadWd();
  wd.startSessionWatcher();
  wd.startSessionWatcher();
  const ivs = timers.filter((t) => t.type === 'interval');
  assert.strictEqual(ivs.length, 1, '只应有一个轮询定时器');
});

afterAll(() => {});
