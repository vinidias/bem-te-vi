'use strict';
import { test } from 'vitest';
import assert from 'node:assert';
import { estimateTokens, createTpsMeter, formatTps } from '../../src/overlay/tps.js';

test('estimateTokens 空文本返回 0', () => {
  assert.strictEqual(estimateTokens(''), 0);
  assert.strictEqual(estimateTokens(null), 0);
});

test('estimateTokens 中文约 0.7 token/字', () => {
  // 4 字 * 0.7 = 2.8 → round = 3
  assert.strictEqual(estimateTokens('你好世界'), 3);
});

test('estimateTokens 英文约 0.28 token/字符', () => {
  assert.strictEqual(estimateTokens('abcdefgh'), 2); // 8*0.28=2.24→2
  assert.strictEqual(estimateTokens('abcd'), 1);      // 4*0.28=1.12→1
});

test('estimateTokens 数字权重', () => {
  assert.strictEqual(estimateTokens('1234567890'), 4); // 10*0.35=3.5→4
});

test('estimateTokens emoji 权重更高', () => {
  const n = estimateTokens('😀😀');
  assert.ok(n >= 4, 'emoji tokens=' + n);
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

test('createTpsMeter 回退路径：累积一段时间后算出估算 TPS', () => {
  const m = createTpsMeter();
  const t0 = 1000;
  m.update('你好', false, null, t0);
  m.update('你好世界', false, null, t0 + 1000);
  assert.ok(m.value > 0, 'value=' + m.value);
  assert.strictEqual(m.active, true);
});

test('createTpsMeter 精确路径：用服务端 accumulated 差值算 TPS', () => {
  const m = createTpsMeter();
  const t0 = 1000;
  // 本轮起始 acc=1000（prompt），1 秒后 acc=1050 → 输出 50 token → 50 t/s
  m.update('', false, 1000, t0);
  m.update('', false, 1050, t0 + 1000);
  assert.ok(Math.abs(m.value - 50) < 0.001, 'value=' + m.value);
  assert.strictEqual(m.tokens, 50);
});

test('createTpsMeter 精确路径优先于估算', () => {
  const m = createTpsMeter();
  const t0 = 1000;
  m.update('很长的正文', false, 2000, t0);
  m.update('很长的正文继续', false, 2100, t0 + 1000);
  // 精确：100 token / 1s = 100，而非按正文长度估算
  assert.ok(Math.abs(m.value - 100) < 0.001, 'value=' + m.value);
});

test('createTpsMeter 计时窗口过短不更新（防虚高）', () => {
  const m = createTpsMeter();
  m.update('你好世界', false, null, 1000);
  m.update('你好世界你好', false, null, 1100); // 仅 0.1s < 0.3s
  assert.strictEqual(m.value, 0);
});

test('createTpsMeter finished 冻结最终值', () => {
  const m = createTpsMeter();
  m.update('你好', false, null, 1000);
  m.update('你好世界', false, null, 2000);
  const v = m.value;
  m.update('你好世界', true, null, 3000);
  assert.strictEqual(m.value, v);
  assert.strictEqual(m.active, false);
});

test('createTpsMeter 新一轮自动重置', () => {
  const m = createTpsMeter();
  m.update('你好', false, null, 1000);
  m.update('你好世界', false, null, 2000);
  assert.ok(m.value > 0);
  m.update('你好世界', true, null, 2000); // 冻结
  m.update('新', false, null, 5000);
  assert.strictEqual(m.value, 0);
});

test('createTpsMeter reset 清空状态', () => {
  const m = createTpsMeter();
  m.update('你好', false, null, 1000);
  m.update('你好世界', false, null, 2000);
  m.reset();
  assert.strictEqual(m.value, 0);
  assert.strictEqual(m.active, false);
});
