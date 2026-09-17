'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const Module = require('module');

// ===== 可观测 mock =====
const sent = [];
const toasts = [];
const store = new Map();
let timers = [];
let url = 'https://chat.deepseek.com/a/chat/s/sess-A';

function installMocks() {
  const orig = Module._load;
  Module._load = function (request) {
    // providers：按 href 提取会话 id
    if (/providers$/.test(request) || request === '../../../src/providers') {
      return {
        getProviderByUrl: (u) => ({
          extractSessionId: (s) => {
            const m = String(s).match(/\/chat\/s\/([a-zA-Z0-9-]+)/);
            return m ? m[1] : null;
          },
        }),
      };
    }
    if (request === './chat-input') {
      return { sendToChat: (msg, tag) => { sent.push({ msg, tag }); return true; } };
    }
    if (request === '../overlay/ui') {
      return { showToast: (m) => { toasts.push(m); } };
    }
    return orig.apply(this, arguments);
  };
  return () => { Module._load = orig; };
}

function installGlobals() {
  global.window = {
    get location() { return { href: url }; },
  };
  global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  global.setTimeout = (fn, ms) => { const t = { fn, ms, type: 'timeout' }; timers.push(t); return t; };
  global.clearTimeout = (t) => { timers = timers.filter((x) => x !== t); };
  global.setInterval = (fn, ms) => { const t = { fn, ms, type: 'interval' }; timers.push(t); return t; };
  global.clearInterval = (t) => { timers = timers.filter((x) => x !== t); };
}

function reset() {
  sent.length = 0; toasts.length = 0;
  store.clear(); timers = [];
  url = 'https://chat.deepseek.com/a/chat/s/sess-A';
}

function loadWd() {
  const p = require.resolve('../../src/preload/dom/tool-loop-watchdog');
  delete require.cache[p];
  return require(p);
}

function lastTimeout() {
  const ts = timers.filter((t) => t.type === 'timeout');
  return ts[ts.length - 1];
}

const restore = installMocks();
installGlobals();

// ================= readConfig =================
test('readConfig 默认值', () => {
  reset();
  const cfg = loadWd()._readConfig();
  assert.strictEqual(cfg.timeout, 90000);
  assert.strictEqual(cfg.prompt, '请继续');
  assert.strictEqual(cfg.count, 3);
});

test('readConfig 读取 localStorage', () => {
  reset();
  store.set('cuckoo-xhr-idle-timeout', '1234');
  store.set('cuckoo-watchdog-prompt', '继续呀');
  store.set('cuckoo-watchdog-count', '5');
  const cfg = loadWd()._readConfig();
  assert.strictEqual(cfg.timeout, 1234);
  assert.strictEqual(cfg.prompt, '继续呀');
  assert.strictEqual(cfg.count, 5);
});

// ================= 开关时机 =================
test('未进入工具循环时，onMessageSent 不开看门狗', () => {
  reset();
  const wd = loadWd();
  wd.onMessageSent();
  assert.strictEqual(timers.length, 0);
});

test('检测到工具调用后，onMessageSent 会开看门狗', () => {
  reset();
  const wd = loadWd();
  wd.onToolCallDetected();
  wd.onMessageSent();
  assert.ok(lastTimeout(), '应有一个看门狗定时器');
});

test('收到终态回复会关看门狗', () => {
  reset();
  const wd = loadWd();
  wd.onToolCallDetected();
  wd.onMessageSent();
  assert.ok(lastTimeout());
  wd.onResponseReceived('finished');
  assert.strictEqual(timers.filter((t) => t.type === 'timeout').length, 0);
});

test('exitToolLoop 退出循环并清计数', () => {
  reset();
  const wd = loadWd();
  wd.onToolCallDetected();
  wd.exitToolLoop();
  wd.onMessageSent();
  assert.strictEqual(timers.length, 0, '退出循环后不再开看门狗');
});

// ================= 超时行为 =================
test('超时且会话一致：发提示词', () => {
  reset();
  const wd = loadWd();
  wd.onToolCallDetected();
  wd.onMessageSent();
  const t = lastTimeout();
  t.fn(); // 触发超时
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].msg, '请继续');
  assert.strictEqual(sent[0].tag, '看门狗');
});

test('超时但会话已切换：不发提示词', () => {
  reset();
  const wd = loadWd();
  wd.onToolCallDetected();
  wd.onMessageSent(); // armedSessionId = sess-A
  const t = lastTimeout();
  url = 'https://chat.deepseek.com/a/chat/s/sess-B'; // 切会话
  t.fn();
  assert.strictEqual(sent.length, 0, '会话已切换，不应发提示词');
});

test('超时次数达上限后停止', () => {
  reset();
  store.set('cuckoo-watchdog-count', '2');
  const wd = loadWd();
  wd.onToolCallDetected();
  wd.onMessageSent();
  lastTimeout().fn(); // 第1次
  wd.onMessageSent(); // 重新 arm
  lastTimeout().fn(); // 第2次
  wd.onMessageSent();
  const before = sent.length;
  lastTimeout().fn(); // 第3次，应被上限拦截
  assert.strictEqual(sent.length, before, '达上限后不再发送');
  assert.ok(toasts.some((s) => /上限/.test(s)));
});

test('成功回复重置超时计数', () => {
  reset();
  store.set('cuckoo-watchdog-count', '2');
  const wd = loadWd();
  wd.onToolCallDetected();
  wd.onMessageSent();
  lastTimeout().fn(); // count=1
  wd.onResponseReceived('finished'); // 重置
  wd.onMessageSent();
  lastTimeout().fn(); // 应重新从 0 计
  wd.onMessageSent();
  const before = sent.length;
  lastTimeout().fn(); // 不被上限拦截
  assert.ok(sent.length > before, '成功后计数重置，应能继续发');
});

test('负数次数表示无限，不因上限停止', () => {
  reset();
  store.set('cuckoo-watchdog-count', '-1');
  const wd = loadWd();
  wd.onToolCallDetected();
  for (let i = 0; i < 10; i++) {
    wd.onMessageSent();
    lastTimeout().fn();
  }
  assert.strictEqual(sent.length, 10, '无限模式每次都发');
});

test('超时时间 <=0 时禁用看门狗', () => {
  reset();
  store.set('cuckoo-xhr-idle-timeout', '0');
  const wd = loadWd();
  wd.onToolCallDetected();
  wd.onMessageSent();
  assert.strictEqual(timers.filter((t) => t.type === 'timeout').length, 0);
});

// ================= 会话监视 =================
test('startSessionWatcher 检测到会话切换后重置', () => {
  reset();
  const wd = loadWd();
  wd.onToolCallDetected();
  wd.onMessageSent(); // arm
  wd.startSessionWatcher();
  const iv = timers.find((t) => t.type === 'interval');
  assert.ok(iv, '应启动轮询');
  url = 'https://chat.deepseek.com/a/chat/s/sess-B';
  iv.fn(); // 触发轮询
  // 重置后 inToolLoop=false
  assert.strictEqual(wd._isInLoop(), false);
});

test('startSessionWatcher 幂等', () => {
  reset();
  const wd = loadWd();
  wd.startSessionWatcher();
  wd.startSessionWatcher();
  const ivs = timers.filter((t) => t.type === 'interval');
  assert.strictEqual(ivs.length, 1, '只应有一个轮询定时器');
});

test.after(() => { restore(); });
