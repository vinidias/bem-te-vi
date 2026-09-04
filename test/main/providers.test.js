'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

const { getProvider, getAllProviders, getProviderByUrl } = require('../../src/providers');
const deepseek = require('../../src/providers/deepseek');
const claude = require('../../src/providers/claude');

test('getAllProviders 包含 deepseek 和 claude', () => {
  const all = getAllProviders();
  assert.ok(all.length >= 2);
  assert.ok(all.some(p => p.id === 'deepseek'));
  assert.ok(all.some(p => p.id === 'claude'));
});

test('getProvider 按 id 查找', () => {
  assert.strictEqual(getProvider('deepseek').id, 'deepseek');
  assert.strictEqual(getProvider('claude').id, 'claude');
  assert.strictEqual(getProvider('unknown'), null);
});

test('getProviderByUrl 识别 DeepSeek URL', () => {
  assert.strictEqual(getProviderByUrl('https://chat.deepseek.com/').id, 'deepseek');
  assert.strictEqual(getProviderByUrl('https://chat.deepseek.com/a/chat/s/abc').id, 'deepseek');
});

test('getProviderByUrl 识别 Claude URL', () => {
  assert.strictEqual(getProviderByUrl('https://claude.ai/new').id, 'claude');
  assert.strictEqual(getProviderByUrl('https://claude.ai/chat/abc').id, 'claude');
});

test('getProviderByUrl 未识别返回 null', () => {
  assert.strictEqual(getProviderByUrl('https://example.com'), null);
  assert.strictEqual(getProviderByUrl(null), null);
});

test('deepseek matchesUrl', () => {
  assert.strictEqual(deepseek.matchesUrl('https://chat.deepseek.com/'), true);
  assert.strictEqual(deepseek.matchesUrl('https://claude.ai'), false);
});

test('claude matchesUrl', () => {
  assert.strictEqual(claude.matchesUrl('https://claude.ai/new'), true);
  assert.strictEqual(claude.matchesUrl('https://chat.deepseek.com'), false);
});

test('deepseek extractSessionId', () => {
  assert.strictEqual(deepseek.extractSessionId('https://chat.deepseek.com/a/chat/s/abc123'), 'abc123');
  assert.strictEqual(deepseek.extractSessionId('https://chat.deepseek.com/s/def456'), 'def456');
  assert.strictEqual(deepseek.extractSessionId('https://chat.deepseek.com/'), null);
});

test('claude extractSessionId', () => {
  assert.strictEqual(claude.extractSessionId('https://claude.ai/chat/abc123'), 'abc123');
  assert.strictEqual(claude.extractSessionId('https://claude.ai/new'), null);
});

test('deepseek isUserMessage 检测 data-role=user', () => {
  const node = { parentElement: null, getAttribute: (n) => n === 'data-role' ? 'user' : '' };
  assert.strictEqual(deepseek.isUserMessage(node), true);
});

test('deepseek isUserMessage 检测普通节点返回 false', () => {
  const node = { parentElement: null, getAttribute: () => '', className: '', textContent: 'normal' };
  assert.strictEqual(deepseek.isUserMessage(node), false);
});

test('claude isUserMessage 检测 data-testid=user-message', () => {
  const node = { parentElement: null, getAttribute: (n) => n === 'data-testid' ? 'user-message' : '' };
  assert.strictEqual(claude.isUserMessage(node), true);
});

test('deepseek getCodeBlockLanguage 从 data-language 提取', () => {
  const pre = {
    getAttribute: (n) => n === 'data-language' ? 'cuckoo' : '',
    closest: () => null,
    querySelector: () => null,
    classList: [],
  };
  assert.strictEqual(deepseek.getCodeBlockLanguage(pre), 'cuckoo');
});

test('claude getCodeBlockLanguage 从 language-* 提取', () => {
  const pre = {
    querySelector: () => ({ className: 'language-cuckoo' }),
  };
  assert.strictEqual(claude.getCodeBlockLanguage(pre), 'cuckoo');
});

test('deepseek getMessageMarkdown 提取消息根节点', () => {
  const msg = { querySelector: (sel) => sel === ':scope > .ds-markdown' ? 'MARKDOWN' : null };
  assert.strictEqual(deepseek.getMessageMarkdown(msg), 'MARKDOWN');
});

test('claude getMessageMarkdown 优先 standard-markdown', () => {
  const msg = {
    querySelector: (sel) => sel === '[class*="standard-markdown"]' ? 'STD' : null,
  };
  assert.strictEqual(claude.getMessageMarkdown(msg), 'STD');
});
