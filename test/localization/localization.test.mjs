import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { localizeJavaScript, localizeHtml } from '../../scripts/lib/localization.mjs';
import { languageOrDefault } from '../../scripts/lib/language.mjs';

test('Portuguese is the default, including invalid or malicious locale values', () => {
  for (const value of [undefined, null, '../../outside', '', 'pt-BR']) assert.equal(languageOrDefault(value), 'pt-BR');
  assert.equal(languageOrDefault('en'), 'en');
  assert.equal(languageOrDefault('zh-CN'), 'zh-CN');
});

test('localization preserves expressions, selectors, regex and user-supplied content', () => {
  const code = 'const user = "用户"; result = { greeting: `你好${user}！`, selector: "#send-button", pattern: /你好/ };';
  const output = localizeJavaScript(code, { '你好': 'Olá ', '！': '!', '用户': '用户' });
  const context = {};
  vm.runInNewContext(output, context);
  assert.equal(context.result.greeting, 'Olá 用户!');
  assert.equal(context.result.selector, '#send-button');
  assert.equal(context.result.pattern.source, '你好');
});

test('template translations cannot execute interpolation or break out of quotes', () => {
  const dangerous = '\\${globalThis.compromised = true}`"\n';
  const output = localizeJavaScript('result = `你好`;', { '你好': dangerous });
  const context = {};
  vm.runInNewContext(output, context);
  assert.equal(context.result, dangerous);
  assert.equal(context.compromised, undefined);
});

test('HTML translates presentation text and inline scripts without changing IDs or styles', () => {
  const source = '<html lang="zh-CN"><style>.x::after {content:"你好"}</style><button id="send" title="你好">你好</button><script>const label = "你好";</script></html>';
  const result = localizeHtml(source, { '你好': 'Olá' }, 'pt-BR');
  assert.match(result, /lang="pt-BR"/);
  assert.match(result, /id="send" title="Olá">Olá/);
  assert.match(result, /const label = "Olá"/);
  assert.match(result, /content:"你好"/);
});

test('translated text nodes do not create executable markup', () => {
  const result = localizeHtml('<p>你好</p>', { '你好': '<img src=x onerror=alert(1)>' }, 'en');
  assert.equal(result, '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
});

test('both catalogs have identical keys and preserve non-presentation HTML attributes', () => {
  const catalogs = ['pt-BR', 'en', 'zh-CN'].map((locale) => JSON.parse(fs.readFileSync(new URL('../../locales/' + locale + '.json', import.meta.url), 'utf8')));
  assert.deepEqual(Object.keys(catalogs[0]).sort(), Object.keys(catalogs[1]).sort());
  assert.deepEqual(Object.keys(catalogs[0]).sort(), Object.keys(catalogs[2]).sort());
  const attributes = (text) => [...text.matchAll(/(?:id|class|href|src|data-[\w-]+)="[^"]*"/g)].map((m) => m[0]);
  for (const catalog of catalogs) {
    for (const [source, translation] of Object.entries(catalog)) {
      assert.equal(typeof translation, 'string');
      assert.deepEqual(attributes(translation), attributes(source), source);
    }
  }
});

test('object prototype names remain literal strings', () => {
  const context = {};
  vm.runInNewContext(localizeJavaScript('result = ["toString", "constructor", "__proto__"];', {}), context);
  assert.equal(JSON.stringify(context.result), '["toString","constructor","__proto__"]');
});
