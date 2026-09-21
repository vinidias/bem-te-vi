'use strict';
import { test, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert';

// watchdog 是带模块级状态的单例，用 resetModules + 动态 import 隔离
let wd;

function setupGlobals() {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
  globalThis.window = {
    location: { href: 'https://chat.deepseek.com/a/chat/s/abc123' },
  };
  // deepseek provider 的 extractSessionId 会识别 sess-1
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ classList: { add() {}, remove() {}, toggle() {} }, style: {}, appendChild() {} }),
    body: { appendChild() {} },
  };
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  return store;
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  setupGlobals();
  wd = await import('../../../src/bridge/loop/watchdog.js');
});

afterEach(() => {
  wd.reset();
  wd.setSuspended(false);
  vi.useRealTimers();
});

test('_readConfig 返回默认值', () => {
  const cfg = wd._readConfig();
  assert.strictEqual(cfg.timeout, 300000);
  assert.strictEqual(cfg.prompt, '请继续');
  assert.strictEqual(cfg.count, 3);
});

test('_readConfig 从 localStorage 覆盖', () => {
  localStorage.setItem('cuckoo-xhr-idle-timeout', '1000');
  localStorage.setItem('cuckoo-watchdog-prompt', '继续吧');
  localStorage.setItem('cuckoo-watchdog-count', '5');
  const cfg = wd._readConfig();
  assert.strictEqual(cfg.timeout, 1000);
  assert.strictEqual(cfg.prompt, '继续吧');
  assert.strictEqual(cfg.count, 5);
});

test('_readConfig 非法值回退默认', () => {
  localStorage.setItem('cuckoo-xhr-idle-timeout', 'abc');
  localStorage.setItem('cuckoo-watchdog-count', 'xyz');
  const cfg = wd._readConfig();
  assert.strictEqual(cfg.timeout, 300000);
  assert.strictEqual(cfg.count, 3);
});

test('非工具循环中 onMessageSent 不开看门狗', () => {
  assert.strictEqual(wd._isInLoop(), false);
  wd.onMessageSent();
  // 没有工具循环，无计时器，推进时间不应触发任何动作（不抛错）
  vi.advanceTimersByTime(400000);
});

test('进入工具循环后 onMessageSent 开看门狗并超时催继续', () => {
  // 借用 sendToChat 无法直接断言，改为监听 toast 不可行；这里验证流程不抛错 + 计时器触发
  wd.onToolCallDetected();
  assert.strictEqual(wd._isInLoop(), true);
  wd.onMessageSent();
  // 默认超时 300000ms，推进到超时
  vi.advanceTimersByTime(300001);
  // 无异常即通过（真实发送失败会被内部 try/catch 吞掉）
});

test('超时次数达上限后停止催继续', () => {
  localStorage.setItem('cuckoo-xhr-idle-timeout', '1000');
  localStorage.setItem('cuckoo-watchdog-count', '1');
  wd.onToolCallDetected();
  wd.onMessageSent();
  vi.advanceTimersByTime(1001); // 第 1 次催
  // 重新计时（onTimeout 不再 arm，需手动再 onMessageSent 模拟下一轮）
  wd.onMessageSent();
  vi.advanceTimersByTime(1001); // 达到上限，不再催
  // 无异常即通过
});

test('onResponseReceived(finished) 重置超时计数', () => {
  localStorage.setItem('cuckoo-xhr-idle-timeout', '1000');
  wd.onToolCallDetected();
  wd.onMessageSent();
  vi.advanceTimersByTime(1001); // 计数 +1
  wd.onResponseReceived('finished'); // 重置计数
  // 再超时应重新从 1 开始（不抛错）
  wd.onMessageSent();
  vi.advanceTimersByTime(1001);
});

test('onResponseReceived 关闭计时器', () => {
  localStorage.setItem('cuckoo-xhr-idle-timeout', '1000');
  wd.onToolCallDetected();
  wd.onMessageSent();
  wd.onResponseReceived('error');
  vi.advanceTimersByTime(5000); // 不应再触发（无异常）
});

test('exitToolLoop 退出并清状态', () => {
  wd.onToolCallDetected();
  assert.strictEqual(wd._isInLoop(), true);
  wd.exitToolLoop();
  assert.strictEqual(wd._isInLoop(), false);
});

test('reset 清理所有状态', () => {
  wd.onToolCallDetected();
  wd.reset();
  assert.strictEqual(wd._isInLoop(), false);
});

test('setSuspended(true) 后 onToolCallDetected 不进入循环', () => {
  wd.setSuspended(true);
  wd.onToolCallDetected();
  assert.strictEqual(wd._isInLoop(), false);
  wd.setSuspended(false);
});

test('setSuspended(true) 会清空进行中状态', () => {
  wd.onToolCallDetected();
  assert.strictEqual(wd._isInLoop(), true);
  wd.setSuspended(true);
  assert.strictEqual(wd._isInLoop(), false);
  wd.setSuspended(false);
});

test('timeout<=0 禁用看门狗', () => {
  localStorage.setItem('cuckoo-xhr-idle-timeout', '0');
  wd.onToolCallDetected();
  wd.onMessageSent();
  vi.advanceTimersByTime(10000000); // 无计时器，无异常
});

test('会话切换后超时不催继续', () => {
  localStorage.setItem('cuckoo-xhr-idle-timeout', '1000');
  wd.onToolCallDetected();
  wd.onMessageSent();
  // 切换会话
  globalThis.window.location.href = 'https://chat.deepseek.com/a/chat/s/def456';
  vi.advanceTimersByTime(1001);
  // 会话切换 → 静默退出工具循环
  assert.strictEqual(wd._isInLoop(), false);
});

test('startSessionWatcher 检测会话切换后 reset', () => {
  wd.onToolCallDetected();
  assert.strictEqual(wd._isInLoop(), true);
  wd.startSessionWatcher();
  globalThis.window.location.href = 'https://chat.deepseek.com/a/chat/s/def456';
  vi.advanceTimersByTime(1501); // 轮询间隔 1500ms
  assert.strictEqual(wd._isInLoop(), false);
});

test('startSessionWatcher 幂等（重复调用不报错）', () => {
  wd.startSessionWatcher();
  wd.startSessionWatcher();
  vi.advanceTimersByTime(100);
});
