'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

// DOM stub 供 ai-response 使用
function makeDom(messages) {
  return {
    querySelectorAll: (sel) => {
      if (sel === '.ds-message') return messages;
      return [];
    },
    querySelector: (sel) => null,
  };
}

const { isAIResponseComplete } = require('../../src/preload/dom/ai-response');

test('isAIResponseComplete 无消息返回 false', () => {
  global.document = makeDom([]);
  assert.strictEqual(isAIResponseComplete(), false);
});

test('isAIResponseComplete 有消息但无操作按钮返回 false', () => {
  const msg = { parentElement: { querySelectorAll: () => [] } };
  global.document = makeDom([msg]);
  assert.strictEqual(isAIResponseComplete(), false);
});

test('isAIResponseComplete 有操作按钮和停止按钮返回 true', () => {
  const msg = { parentElement: { querySelectorAll: () => [{}, {}] } };
  global.document = makeDom([msg]);
  global.document.querySelector = (sel) => ({});
  assert.strictEqual(isAIResponseComplete(), true);
});
