'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const windowState = require('../../src/main/window');

test('getMainWindow 初始为 null', () => {
  assert.strictEqual(windowState.getMainWindow(), null);
});

test('setMainWindow 与 getMainWindow 往返', () => {
  const fake = { id: 1 };
  windowState.setMainWindow(fake);
  assert.strictEqual(windowState.getMainWindow(), fake);
  windowState.setMainWindow(null);
  assert.strictEqual(windowState.getMainWindow(), null);
});
