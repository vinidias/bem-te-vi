'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { OVERLAY_HTML, OVERLAY_CSS } = require('../../src/preload/overlay/template');

test('OVERLAY_HTML 包含核心元素', () => {
  assert.ok(OVERLAY_HTML.includes('cuckoo-overlay'));
  assert.ok(OVERLAY_HTML.includes('cuckoo-btn-init'));
  assert.ok(OVERLAY_HTML.includes('cuckoo-session-list'));
  assert.ok(OVERLAY_HTML.includes('cuckoo-btn-manual-parse'));
  assert.ok(OVERLAY_HTML.includes('cuckoo-status-badge'));
});

test('OVERLAY_CSS 包含核心样式', () => {
  assert.ok(OVERLAY_CSS.includes('.cuckoo-overlay'));
  assert.ok(OVERLAY_CSS.includes('--ck-primary'));
  assert.ok(OVERLAY_CSS.includes('cuckoo-hidden'));
});
