'use strict';
/**
 * infra/user-agent µÁïÞ»ò´╝êþ║»Õç¢µò░´╝ë
 *
 * Õà│Úö«´╝ÜUA ÚçîþÜä Chrome þëêµ£¼Õ┐àÚí╗µØÑÞç¬ process.versions.chrome´╝êþ£ƒÕ«×Õåàµá©´╝ë´╝î
 * ÕÉªÕêÖõ©Ä sec-ch-ua þƒøþø¥´╝îõ╝ÜÞó½ Google ÕêñÕ«Ü"µÁÅÞºêÕÖ¿õ©ìÕ«ëÕà¿"ÒÇé
 */
import { test } from 'vitest';
import assert from 'node:assert';
import { buildChromeUserAgent, chromeMajor, buildClientHintsHeaders, buildUserAgentDataFix, getPlatformProfile } from '../../src/infra/user-agent.js';

test('chromeMajor ÕÅûõ©╗þëêµ£¼ÕÅÀ', () => {
  const prev = process.versions.chrome;
  try {
    Object.defineProperty(process.versions, 'chrome', { value: '152.0.7977.130', configurable: true });
    assert.strictEqual(chromeMajor(), '152');
  } finally {
    Object.defineProperty(process.versions, 'chrome', { value: prev, configurable: true });
  }
});

test('chromeMajor µùáþëêµ£¼µùÂÕø×ÚÇÇ 0', () => {
  const prev = process.versions.chrome;
  try {
    Object.defineProperty(process.versions, 'chrome', { value: '', configurable: true });
    assert.strictEqual(chromeMajor(), '0');
  } finally {
    Object.defineProperty(process.versions, 'chrome', { value: prev, configurable: true });
  }
});

test('buildChromeUserAgent õ¢┐þö¿þ£ƒÕ«×Õåàµá©þëêµ£¼´╝êÚØ×ÕåÖµ¡╗´╝ë', () => {
  const prev = process.versions.chrome;
  try {
    Object.defineProperty(process.versions, 'chrome', { value: '152.0.7977.130', configurable: true });
    const ua = buildChromeUserAgent();
    assert.ok(ua.includes('Chrome/152.0.0.0'), 'UA Õ║öÕÉ½þ£ƒÕ«×õ©╗þëêµ£¼ 152');
    assert.ok(!ua.includes('Electron'), 'UA õ©ìÕ║öÕÉ½ Electron µáçÞ»å');
    assert.ok(ua.includes('Safari/537.36'));
  } finally {
    Object.defineProperty(process.versions, 'chrome', { value: prev, configurable: true });
  }
});

test('buildChromeUserAgent ÚÜÅÕåàµá©þëêµ£¼ÕÅÿÕîû´╝êÚÿ▓ÕåÖµ¡╗Õø×Õ¢Æ´╝ë', () => {
  const prev = process.versions.chrome;
  try {
    Object.defineProperty(process.versions, 'chrome', { value: '160.1.2.3', configurable: true });
    assert.ok(buildChromeUserAgent().includes('Chrome/160.0.0.0'));
  } finally {
    Object.defineProperty(process.versions, 'chrome', { value: prev, configurable: true });
  }
});

// ================= Õ╣│ÕÅ░µäƒþƒÑ´╝êChromium µ║ÉþáüÕå╗þ╗ôÕ©©ÚçÅ´╝ë=================

test('getPlatformProfile õ©ëÕ╣│ÕÅ░Þ┐öÕø× Chromium µ║ÉþáüÕå╗þ╗ôÕ©©ÚçÅ', () => {
  const win = getPlatformProfile('win32', 'x64');
  assert.strictEqual(win.uaPlatform, 'Windows NT 10.0; Win64; x64');
  assert.strictEqual(win.chUaPlatform, '"Windows"');
  assert.strictEqual(win.uadPlatform, 'Windows');

  const mac = getPlatformProfile('darwin', 'arm64');
  assert.strictEqual(mac.uaPlatform, 'Macintosh; Intel Mac OS X 10_15_7');
  assert.strictEqual(mac.chUaPlatform, '"macOS"');
  assert.strictEqual(mac.uadPlatform, 'macOS');
  assert.strictEqual(mac.architecture, 'arm', 'Apple Silicon µ×Âµ×äÕ║öõ©║ arm');

  const macIntel = getPlatformProfile('darwin', 'x64');
  assert.strictEqual(macIntel.architecture, 'x86');

  const linux = getPlatformProfile('linux', 'x64');
  assert.strictEqual(linux.uaPlatform, 'X11; Linux x86_64');
  assert.strictEqual(linux.chUaPlatform, '"Linux"');
  assert.strictEqual(linux.uadPlatform, 'Linux');
  assert.strictEqual(linux.platformVersion, '', 'Linux þÜä platformVersion õ©║þ®║õ©▓´╝êÕ»╣Ú¢Éþ£ƒÕ«× Chrome´╝ë');
});

test('buildChromeUserAgent õ©ëÕ╣│ÕÅ░ UA õ©▓µ¡úþí«õ©öõ©ìÕÉ½ Electron', () => {
  const prev = process.versions.chrome;
  try {
    Object.defineProperty(process.versions, 'chrome', { value: '152.0.7977.130', configurable: true });

    const win = buildChromeUserAgent('win32', 'x64');
    assert.ok(win.startsWith('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), win);
    assert.ok(win.includes('Chrome/152.0.0.0'));

    const mac = buildChromeUserAgent('darwin', 'arm64');
    assert.ok(mac.startsWith('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), mac);
    assert.ok(mac.includes('Chrome/152.0.0.0'));

    const linux = buildChromeUserAgent('linux', 'x64');
    assert.ok(linux.startsWith('Mozilla/5.0 (X11; Linux x86_64)'), linux);
    assert.ok(linux.includes('Chrome/152.0.0.0'));

    for (const ua of [win, mac, linux]) {
      assert.ok(!ua.includes('Electron'), 'UA õ©ìÕ║öÕÉ½ Electron');
      assert.ok(ua.endsWith('Safari/537.36'), 'UA Õ║öõ╗Ñ Safari/537.36 þ╗ôÕ░¥');
    }
  } finally {
    Object.defineProperty(process.versions, 'chrome', { value: prev, configurable: true });
  }
});

test('buildClientHintsHeaders þÜä sec-ch-ua-platform ÚÜÅÕ╣│ÕÅ░ÕÅÿÕîû', () => {
  assert.strictEqual(buildClientHintsHeaders('win32', 'x64')['sec-ch-ua-platform'], '"Windows"');
  assert.strictEqual(buildClientHintsHeaders('darwin', 'arm64')['sec-ch-ua-platform'], '"macOS"');
  assert.strictEqual(buildClientHintsHeaders('linux', 'x64')['sec-ch-ua-platform'], '"Linux"');
});

test('buildUserAgentDataFix µ│¿ÕàÑÞäÜµ£¼Õåà platform õ©ÄÕ╣│ÕÅ░õ©ÇÞç┤´╝êõ©ìÕåìµüÆõ©║ Windows´╝ë', () => {
  const prev = process.versions.chrome;
  try {
    Object.defineProperty(process.versions, 'chrome', { value: '152.0.7977.130', configurable: true });

    const macScript = buildUserAgentDataFix('darwin', 'arm64');
    assert.ok(macScript.includes('platform:"macOS"'), 'userAgentData.platform Õ║öõ©║ macOS');
    assert.ok(!macScript.includes('platform:"Windows"'), 'macOS ÞäÜµ£¼õ©ìÕ║öÕÉ½ Windows');
    assert.ok(macScript.includes('architecture:"arm"'), 'Apple Silicon µ×Âµ×äÕ║öõ©║ arm');
    assert.ok(macScript.includes('navigator,"webdriver"'), 'Õ║öõ╗ìõ┐«µ¡ú webdriver');

    const linuxScript = buildUserAgentDataFix('linux', 'x64');
    assert.ok(linuxScript.includes('platform:"Linux"'));
    assert.ok(linuxScript.includes('platformVersion:""'), 'Linux platformVersion Õ║öõ©║þ®║õ©▓');

    const winScript = buildUserAgentDataFix('win32', 'x64');
    assert.ok(winScript.includes('platform:"Windows"'));
    assert.ok(winScript.includes('platformVersion:"10.0.0"'));
  } finally {
    Object.defineProperty(process.versions, 'chrome', { value: prev, configurable: true });
  }
});

test('Ú╗ÿÞ«ñÕÅéµò░ÞÁ░ process.platform´╝êWindows þÄ»ÕóâÕø×Õ¢Æõ┐Øµèñ´╝ë', () => {
  // µÁïÞ»òµ£║µÿ» Windows´╝ÜÚ╗ÿÞ«ñÞ░âþö¿Õ║öõ©Äµÿ¥Õ╝Åõ╝á win32 õ©ÇÞç┤
  if (process.platform === 'win32') {
    assert.strictEqual(buildChromeUserAgent(), buildChromeUserAgent('win32', process.arch));
    assert.deepStrictEqual(buildClientHintsHeaders(), buildClientHintsHeaders('win32', process.arch));
  }
});
