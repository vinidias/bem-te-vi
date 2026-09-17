'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const Module = require('module');

// ===== 记录工具/回传调用 =====
const toolCalls = [];
const jsResults = [];
const chatMessages = [];

function installMocks() {
  const orig = Module._load;
  Module._load = function (request) {
    if (request === './js-detector') {
      return { extractJsToolBlocks: () => [], BT: '\u0060' };
    }
    if (request === './tool-parser') {
      return { tryParseToolCall: () => null };
    }
    if (request === './tool-executor') {
      return {
        handleToolCall: (tc) => { toolCalls.push(tc); return Promise.resolve(); },
        handleJsToolScript: (code) => { jsResults.push(code); return Promise.resolve({ code, result: { success: true } }); },
      };
    }
    if (request === './chat-input') {
      return {
        sendToolResultToChat: () => {},
        sendCombinedJsResultsToChat: () => {},
        sendMessageToChat: (m) => { chatMessages.push(m); },
      };
    }
    if (request === '../tool-names') {
      return { hasTool: () => true, toolNamesList: () => 'read,write' };
    }
    if (request === './state') {
      return { serverTokenUsage: null, lastResponseMsgIds: null };
    }
    return orig.apply(this, arguments);
  };
  return () => { Module._load = orig; };
}

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
  toolCalls.length = 0;
  jsResults.length = 0;
  chatMessages.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
}

function loadObserver() {
  const p = require.resolve('../../src/preload/dom/intercept-observer');
  delete require.cache[p];
  return require(p);
}

function emit(type, detail) {
  const arr = listeners[type] || [];
  for (const cb of arr) cb({ detail });
}

const restore = installMocks();
installGlobals();

test('onInterceptedResponse 注册与注销', () => {
  reset();
  const obs = loadObserver();
  let called = 0;
  const off = obs.onInterceptedResponse(() => { called++; });
  assert.strictEqual(typeof off, 'function');
  off();
});

test('onAiError 注册与注销', () => {
  reset();
  const obs = loadObserver();
  let called = 0;
  const off = obs.onAiError(() => { called++; });
  assert.strictEqual(typeof off, 'function');
  off();
});

test('status=stopped 不通知任何监听器', () => {
  reset();
  const obs = loadObserver();
  obs.startInterceptObserver();
  let respHit = 0;
  obs.onInterceptedResponse(() => { respHit++; });
  emit('cuckoo-ai-response', { status: 'stopped', text: '半截' });
  assert.strictEqual(respHit, 0, 'stopped 不应通知 response 监听器');
});

test('status=finished 通知 response 监听器', () => {
  reset();
  const obs = loadObserver();
  obs.startInterceptObserver();
  let got = '';
  obs.onInterceptedResponse((t) => { got = t; });
  emit('cuckoo-ai-response', { status: 'finished', finished: true, text: '完整回复' });
  assert.strictEqual(got, '完整回复');
});

test('cuckoo-ai-error 通知 error 监听器并带 detail', () => {
  reset();
  const obs = loadObserver();
  obs.startInterceptObserver();
  let got = null;
  obs.onAiError((d) => { got = d; });
  emit('cuckoo-ai-error', { reason: 'xhr', httpStatus: 0 });
  assert.ok(got);
  assert.strictEqual(got.reason, 'xhr');
  assert.strictEqual(got.httpStatus, 0);
});

test('getLastInterceptedText 记录最近成功回复', () => {
  reset();
  const obs = loadObserver();
  obs.startInterceptObserver();
  emit('cuckoo-ai-response', { status: 'finished', finished: true, text: 'ABC' });
  assert.strictEqual(obs.getLastInterceptedText(), 'ABC');
});

test('stopped 不覆盖 lastInterceptedText', () => {
  reset();
  const obs = loadObserver();
  obs.startInterceptObserver();
  emit('cuckoo-ai-response', { status: 'finished', finished: true, text: 'FIRST' });
  emit('cuckoo-ai-response', { status: 'stopped', text: '半截' });
  assert.strictEqual(obs.getLastInterceptedText(), 'FIRST');
});

test('多个 response 监听器都被通知', () => {
  reset();
  const obs = loadObserver();
  obs.startInterceptObserver();
  let a = 0, b = 0;
  obs.onInterceptedResponse(() => { a++; });
  obs.onInterceptedResponse(() => { b++; });
  emit('cuckoo-ai-response', { status: 'finished', finished: true, text: 'x' });
  assert.strictEqual(a, 1);
  assert.strictEqual(b, 1);
});

test.after(() => { restore(); });
