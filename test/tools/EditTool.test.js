'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseEditArgs, formatEditOutput } = require('../../tools/EditTool');

test('parseEditArgs 正常', () => {
  assert.deepStrictEqual(parseEditArgs('a.txt', 'old', 'new', false), { filePath: 'a.txt', oldString: 'old', newString: 'new', replaceAll: false });
  assert.deepStrictEqual(parseEditArgs('a.txt', 'old', 'new', true), { filePath: 'a.txt', oldString: 'old', newString: 'new', replaceAll: true });
});

test('parseEditArgs 空 filePath', () => {
  assert.throws(() => parseEditArgs('', 'o', 'n', false), /file_path must be a non-empty string/);
});

test('parseEditArgs 空 old_string', () => {
  assert.throws(() => parseEditArgs('a.txt', '', 'n', false), /old_string must be a non-empty string/);
  assert.throws(() => parseEditArgs('a.txt', null, 'n', false), /old_string must be a non-empty string/);
});

test('parseEditArgs new_string 非字符串', () => {
  assert.throws(() => parseEditArgs('a.txt', 'o', 123, false), /new_string must be a string/);
});

test('parseEditArgs old === new 抛错', () => {
  assert.throws(() => parseEditArgs('a.txt', 'same', 'same', false), /old_string and new_string must differ/);
});

test('formatEditOutput 唯一/全部替换', () => {
  assert.match(formatEditOutput('a.txt', false), /updated successfully/);
  assert.match(formatEditOutput('a.txt', true), /All occurrences were successfully replaced/);
});
