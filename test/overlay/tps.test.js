'use strict';
import { test } from 'vitest';
import assert from 'node:assert';
import { estimateTokens, createTpsMeter, formatTps } from '../../src/overlay/tps.js';

test('estimateTokens 空文本返回 0', () => {
  assert.strictEqual(estimateTokens(''), 0);
  assert.strictEqual(estimateTokens(null), 0);
});

test('estimateTokens 中文按 1 字 1 token', () => {
  assert.strictEqual(estimateTokens('你好世界'), 4);
});

test('estimateTokens 英文按 4 字符 1 token', () => {
  assert.strictEqual(estimateTokens('abcdefgh'), 2);
  assert.strictEqual(estimateTokens('abcd'), 1);
});

test('estimateTokens 中英混合', () => {
  // 2 中文 + 4 英文 = 2 + 1 = 3
  assert.strictEqual(estimateTokens('中文abcd'), 3);
});

test('formatTps 无数据返回空串', () => {
  assert.strictEqual(formatTps(0), '');
  assert.strictEqual(formatTps(-1), '');
  assert.strictEqual(formatTps(NaN), '');
});

test('formatTps 小于 100 保留一位小数', () => {
  assert.strictEqual(formatTps(12.34), '12.3');
  assert.strictEqual(formatTps(0.5), '0.5');
});

test('formatTps 大于等于 100 取整', () => {
  assert.strictEqual(formatTps(123.6), '124');
});

test('createTpsMeter 初始值为 0', () => {
  const m = createTpsMeter();
  assert.strictEqual(m.value, 0);
  assert.strictEqual(m.active, false);
});

test('createTpsMeter 累积一段时间后算出 TPS', () => {
  const m = createTpsMeter();
  const t0 = 1000;
  m.update('你好', false, t0);          // 首字，tokens=2
  m.update('你好世界', false, t0 + 1000); // 1 秒后，tokens=4 → 4/1=4
  assert.ok(Math.abs(m.value - 4) < 0.001, 'value=' + m.value);
  assert.strictEqual(m.active, true);
});

test('createTpsMeter 计时窗口过短不更新（防虚高）', () => {
  const m = createTpsMeter();
  m.update('你好世界', false, 1000);
  m.update('你好世界你好', false, 1100); // 仅 0.1s < 0.3s
  assert.strictEqual(m.value, 0);
});

test('createTpsMeter finished 冻结最终值', () => {
  const m = createTpsMeter();
  m.update('你好', false, 1000);
  m.update('你好世界', false, 2000);
  const v = m.value;
  m.update('你好世界', true, 3000); // finished
  assert.strictEqual(m.value, v);
  assert.strictEqual(m.active, false);
});

test('createTpsMeter 新一轮自动重置', () => {
  const m = createTpsMeter();
  m.update('你好', false, 1000);
  m.update('你好世界', false, 2000);
  assert.ok(m.value > 0);
  m.update('你好世界', true, 2000); // 冻结
  // 新一轮第一个 token
  m.update('新', false, 5000);
  assert.strictEqual(m.value, 0); // 重置后尚未形成计时窗口
});

test('createTpsMeter reset 清空状态', () => {
  const m = createTpsMeter();
  m.update('你好', false, 1000);
  m.update('你好世界', false, 2000);
  m.reset();
  assert.strictEqual(m.value, 0);
  assert.strictEqual(m.active, false);
});
