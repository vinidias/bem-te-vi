import { test, afterAll, vi } from 'vitest';
import assert from 'node:assert';

// ===== 可观测 mock（vi.mock 工厂 hoisted，引用对象放 vi.hoisted）=====
const mocks = vi.hoisted(() => ({
  sent: [],
  toasts: [],
  errorCb: null,
  responseCb: null,
}));

vi.mock('../../src/preload/dom/chat-input.js', () => ({
  sendToChat: (msg, tag) => { mocks.sent.push({ msg, tag }); return true; },
}));

vi.mock('../../src/preload/dom/intercept-observer.js', () => ({
  onAiError: (cb) => { mocks.errorCb = cb; return () => { mocks.errorCb = null; }; },
  onInterceptedResponse: (cb) => { mocks.responseCb = cb; return () => { mocks.responseCb = null; }; },
}));

vi.mock('../../src/preload/overlay/ui.js', () => ({
  showToast: (m) => { mocks.toasts.push(m); },
}));

vi.mock('../../src/providers/index.js', () => ({
  getProviderByUrl: () => ({
    extractSessionId: (s) => {
      const m = String(s).match(/\/chat\/s\/([a-zA-Z0-9-]+)/);
      return m ? m[1] : null;
    },
  }),
}));

// ===== 全局桩 =====
const store = new Map();
let timers = [];
let curUrl = 'https://chat.deepseek.com/a/chat/s/sess-A';

function installGlobals() {
  global.window = { get location() { return { href: curUrl }; } };
  global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  global.document = {
    getElementById: () => null,
    createElement: () => ({
      textContent: '', innerHTML: '', onclick: null,
      classList: { add() {}, remove() {}, contains() { return false; } },
      querySelector: () => ({ textContent: '', onclick: null }),
    }),
    body: { appendChild: () => {} },
  };
  global.setTimeout = (fn, ms) => { const t = { fn, ms, type: 'timeout' }; timers.push(t); return t; };
  global.clearTimeout = (t) => { timers = timers.filter((x) => x !== t); };
  global.setInterval = (fn, ms) => { const t = { fn, ms, type: 'interval' }; timers.push(t); return t; };
  global.clearInterval = (t) => { timers = timers.filter((x) => x !== t); };
}

function reset() {
  mocks.sent.length = 0; mocks.toasts.length = 0;
  mocks.errorCb = null; mocks.responseCb = null;
  store.clear(); timers = [];
  curUrl = 'https://chat.deepseek.com/a/chat/s/sess-A';
}

async function loadEngine() {
  vi.resetModules();
  return await import('../../src/preload/dom/retry-engine.js');
}

function lastTimeout() {
  const ts = timers.filter((t) => t.type === 'timeout');
  return ts[ts.length - 1];
}

installGlobals();

// ================= readConfig =================
test('readConfig 无配置返回默认值', async () => {
  reset();
  const eng = await loadEngine();
  const cfg = eng.readConfig();
  assert.strictEqual(cfg.enabled, true);
  assert.strictEqual(cfg.delayMin, 4000);
  assert.strictEqual(cfg.delayMax, 10000);
  assert.strictEqual(cfg.count, 10);
  assert.strictEqual(cfg.delay429, 60000);
  assert.strictEqual(cfg.count429, 20);
  assert.strictEqual(cfg.prompt, eng.DEFAULT_PROMPT);
});

test('readConfig 读取自定义值', async () => {
  reset();
  store.set('cuckoo-retry-enabled', '0');
  store.set('cuckoo-retry-delay-min', '1000');
  store.set('cuckoo-retry-delay-max', '2000');
  store.set('cuckoo-retry-count', '3');
  store.set('cuckoo-retry-429-delay', '30000');
  store.set('cuckoo-retry-429-count', '5');
  store.set('cuckoo-retry-prompt', '自定义');
  const cfg = (await loadEngine()).readConfig();
  assert.strictEqual(cfg.enabled, false);
  assert.strictEqual(cfg.delayMin, 1000);
  assert.strictEqual(cfg.delayMax, 2000);
  assert.strictEqual(cfg.count, 3);
  assert.strictEqual(cfg.delay429, 30000);
  assert.strictEqual(cfg.count429, 5);
  assert.strictEqual(cfg.prompt, '自定义');
});

test('readConfig 负数次数（无限）保留', async () => {
  reset();
  store.set('cuckoo-retry-count', '-1');
  store.set('cuckoo-retry-429-count', '-2');
  const cfg = (await loadEngine()).readConfig();
  assert.strictEqual(cfg.count, -1);
  assert.strictEqual(cfg.count429, -2);
});

// ================= handleError 门控 =================
test('禁用时 handleError 不安排重试', async () => {
  reset();
  store.set('cuckoo-retry-enabled', '0');
  const eng = await loadEngine();
  eng.startRetryEngine();
  mocks.errorCb({ reason: 'xhr' });
  assert.strictEqual(timers.length, 0);
});

test('压缩进行中 handleError 不安排重试', async () => {
  reset();
  const eng = await loadEngine();
  eng.startRetryEngine();
  eng.setCompacting(true);
  mocks.errorCb({ reason: 'xhr' });
  assert.strictEqual(timers.length, 0);
  eng.setCompacting(false);
});

test('startRetryEngine 幂等（多次调用只订阅一次）', async () => {
  reset();
  const eng = await loadEngine();
  eng.startRetryEngine();
  const first = mocks.errorCb;
  eng.startRetryEngine();
  assert.strictEqual(mocks.errorCb, first, '第二次调用不应重新订阅');
});

// ================= 普通失败 =================
test('普通失败：安排定时器并在触发时发送提示词', async () => {
  reset();
  store.set('cuckoo-retry-delay-min', '5');
  store.set('cuckoo-retry-delay-max', '5');
  const eng = await loadEngine();
  eng.startRetryEngine();
  mocks.errorCb({ reason: 'xhr', httpStatus: 0 });
  const t = lastTimeout();
  assert.ok(t, '应有重试定时器');
  assert.strictEqual(t.ms, 5);
  t.fn();
  assert.strictEqual(mocks.sent.length, 1);
  assert.strictEqual(mocks.sent[0].msg, eng.DEFAULT_PROMPT);
});

test('普通失败达到上限后停止并提示', async () => {
  reset();
  store.set('cuckoo-retry-delay-min', '1');
  store.set('cuckoo-retry-delay-max', '1');
  store.set('cuckoo-retry-count', '2');
  const eng = await loadEngine();
  eng.startRetryEngine();
  mocks.errorCb({ reason: 'xhr' });
  mocks.errorCb({ reason: 'xhr' });
  timers = [];
  mocks.errorCb({ reason: 'xhr' });
  assert.strictEqual(timers.length, 0);
  assert.ok(mocks.toasts.some((s) => /上限/.test(s)));
});

test('成功回复重置计数', async () => {
  reset();
  store.set('cuckoo-retry-delay-min', '1');
  store.set('cuckoo-retry-delay-max', '1');
  store.set('cuckoo-retry-count', '2');
  const eng = await loadEngine();
  eng.startRetryEngine();
  mocks.errorCb({ reason: 'xhr' });
  mocks.errorCb({ reason: 'xhr' });
  mocks.responseCb('ok');
  timers = [];
  mocks.errorCb({ reason: 'xhr' });
  assert.ok(lastTimeout(), '成功后计数重置，应能重新安排');
});

test('成功回复会清除待重试定时器', async () => {
  reset();
  store.set('cuckoo-retry-delay-min', '5');
  store.set('cuckoo-retry-delay-max', '5');
  const eng = await loadEngine();
  eng.startRetryEngine();
  mocks.errorCb({ reason: 'xhr' });
  assert.ok(lastTimeout());
  mocks.responseCb('ok');
  assert.strictEqual(timers.filter((t) => t.type === 'timeout').length, 0);
});

// ================= 429 独立计数 =================
test('429 使用 429 专属间隔', async () => {
  reset();
  store.set('cuckoo-retry-429-delay', '7');
  store.set('cuckoo-retry-429-count', '3');
  const eng = await loadEngine();
  eng.startRetryEngine();
  mocks.errorCb({ reason: 'http', httpStatus: 429 });
  const t = lastTimeout();
  assert.ok(t);
  assert.strictEqual(t.ms, 7);
});

test('429 达到上限后停止且提示', async () => {
  reset();
  store.set('cuckoo-retry-429-delay', '1');
  store.set('cuckoo-retry-429-count', '1');
  const eng = await loadEngine();
  eng.startRetryEngine();
  mocks.errorCb({ httpStatus: 429 });
  timers = [];
  mocks.errorCb({ httpStatus: 429 });
  assert.strictEqual(timers.length, 0);
  assert.ok(mocks.toasts.some((s) => /429/.test(s)));
});

test('普通失败与 429 计数相互独立', async () => {
  reset();
  store.set('cuckoo-retry-delay-min', '1');
  store.set('cuckoo-retry-delay-max', '1');
  store.set('cuckoo-retry-429-delay', '1');
  store.set('cuckoo-retry-count', '1');
  store.set('cuckoo-retry-429-count', '5');
  const eng = await loadEngine();
  eng.startRetryEngine();
  mocks.errorCb({ reason: 'xhr' });
  mocks.errorCb({ httpStatus: 429 });
  timers = [];
  mocks.errorCb({ httpStatus: 429 });
  assert.ok(lastTimeout(), '429 计数独立，不应被普通上限拦截');
});

test('无限重试（次数为负）不因上限停止', async () => {
  reset();
  store.set('cuckoo-retry-delay-min', '1');
  store.set('cuckoo-retry-delay-max', '1');
  store.set('cuckoo-retry-count', '-1');
  const eng = await loadEngine();
  eng.startRetryEngine();
  for (let i = 0; i < 50; i++) mocks.errorCb({ reason: 'xhr' });
  timers = [];
  mocks.errorCb({ reason: 'xhr' });
  assert.ok(lastTimeout(), '负数次数应无限重试');
});

// ================= 会话校验 =================
test('错误事件的会话与当前一致：正常重试', async () => {
  reset();
  store.set('cuckoo-retry-delay-min', '1');
  store.set('cuckoo-retry-delay-max', '1');
  const eng = await loadEngine();
  eng.startRetryEngine();
  mocks.errorCb({ reason: 'xhr', sessionId: 'sess-A' });
  assert.ok(lastTimeout(), '会话一致应安排重试');
});

test('错误事件的会话已切换：忽略，不重试', async () => {
  reset();
  store.set('cuckoo-retry-delay-min', '1');
  store.set('cuckoo-retry-delay-max', '1');
  const eng = await loadEngine();
  eng.startRetryEngine();
  mocks.errorCb({ reason: 'xhr', sessionId: 'sess-OLD' });
  assert.strictEqual(timers.filter((t) => t.type === 'timeout').length, 0, '会话已切换不应重试');
});

test('错误事件无 sessionId：不做会话校验，正常重试', async () => {
  reset();
  store.set('cuckoo-retry-delay-min', '1');
  store.set('cuckoo-retry-delay-max', '1');
  const eng = await loadEngine();
  eng.startRetryEngine();
  mocks.errorCb({ reason: 'xhr' });
  assert.ok(lastTimeout(), '无 sessionId 应照常重试');
});

afterAll(() => {});
