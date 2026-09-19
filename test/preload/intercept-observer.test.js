import { test, afterAll, vi } from 'vitest';
import assert from 'node:assert';

// ===== 记录工具/回传调用（vi.mock 工厂 hoisted，引用对象放 vi.hoisted）=====
const mocks = vi.hoisted(() => ({
  toolCalls: [],
  jsResults: [],
  chatMessages: [],
}));

vi.mock('../../src/preload/dom/js-detector.js', () => ({
  extractJsToolBlocks: () => [],
  BT: '`',
}));

vi.mock('../../src/preload/dom/tool-parser.js', () => ({
  tryParseToolCall: () => null,
}));

vi.mock('../../src/preload/dom/tool-executor.js', () => ({
  handleToolCall: (tc) => { mocks.toolCalls.push(tc); return Promise.resolve(); },
  handleJsToolScript: (code) => { mocks.jsResults.push(code); return Promise.resolve({ code, result: { success: true } }); },
}));

vi.mock('../../src/preload/dom/chat-input.js', () => ({
  sendToolResultToChat: () => {},
  sendCombinedJsResultsToChat: () => {},
  sendMessageToChat: (m) => { mocks.chatMessages.push(m); },
}));

vi.mock('../../src/preload/tool-names.js', () => ({
  hasTool: () => true,
  toolNamesList: () => 'read,write',
}));

// ===== 捕获事件监听器 =====
const listeners = {};
const fakeWindow = {
  addEventListener: (type, cb) => {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(cb);
  },
  electronAPI: { showAiNotification: () => Promise.resolve() },
};

function installGlobals() {
  global.window = fakeWindow;
}

function reset() {
  mocks.toolCalls.length = 0;
  mocks.jsResults.length = 0;
  mocks.chatMessages.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
}

async function loadObserver() {
  vi.resetModules();
  return await import('../../src/preload/dom/intercept-observer.js');
}

function emit(type, detail) {
  const arr = listeners[type] || [];
  for (const cb of arr) cb({ detail });
}

installGlobals();

test('onInterceptedResponse 注册与注销', async () => {
  reset();
  const obs = await loadObserver();
  let called = 0;
  const off = obs.onInterceptedResponse(() => { called++; });
  assert.strictEqual(typeof off, 'function');
  off();
});

test('onAiError 注册与注销', async () => {
  reset();
  const obs = await loadObserver();
  let called = 0;
  const off = obs.onAiError(() => { called++; });
  assert.strictEqual(typeof off, 'function');
  off();
});

test('status=stopped 不通知任何监听器', async () => {
  reset();
  const obs = await loadObserver();
  obs.startInterceptObserver();
  let respHit = 0;
  obs.onInterceptedResponse(() => { respHit++; });
  emit('cuckoo-ai-response', { status: 'stopped', text: '半截' });
  assert.strictEqual(respHit, 0, 'stopped 不应通知 response 监听器');
});

test('status=finished 通知 response 监听器', async () => {
  reset();
  const obs = await loadObserver();
  obs.startInterceptObserver();
  let got = '';
  obs.onInterceptedResponse((t) => { got = t; });
  emit('cuckoo-ai-response', { status: 'finished', finished: true, text: '完整回复' });
  assert.strictEqual(got, '完整回复');
});

test('cuckoo-ai-error 通知 error 监听器并带 detail', async () => {
  reset();
  const obs = await loadObserver();
  obs.startInterceptObserver();
  let got = null;
  obs.onAiError((d) => { got = d; });
  emit('cuckoo-ai-error', { reason: 'xhr', httpStatus: 0 });
  assert.ok(got);
  assert.strictEqual(got.reason, 'xhr');
  assert.strictEqual(got.httpStatus, 0);
});

test('getLastInterceptedText 记录最近成功回复', async () => {
  reset();
  const obs = await loadObserver();
  obs.startInterceptObserver();
  emit('cuckoo-ai-response', { status: 'finished', finished: true, text: 'ABC' });
  assert.strictEqual(obs.getLastInterceptedText(), 'ABC');
});

test('stopped 不覆盖 lastInterceptedText', async () => {
  reset();
  const obs = await loadObserver();
  obs.startInterceptObserver();
  emit('cuckoo-ai-response', { status: 'finished', finished: true, text: 'FIRST' });
  emit('cuckoo-ai-response', { status: 'stopped', text: '半截' });
  assert.strictEqual(obs.getLastInterceptedText(), 'FIRST');
});

test('多个 response 监听器都被通知', async () => {
  reset();
  const obs = await loadObserver();
  obs.startInterceptObserver();
  let a = 0, b = 0;
  obs.onInterceptedResponse(() => { a++; });
  obs.onInterceptedResponse(() => { b++; });
  emit('cuckoo-ai-response', { status: 'finished', finished: true, text: 'x' });
  assert.strictEqual(a, 1);
  assert.strictEqual(b, 1);
});

afterAll(() => {});
