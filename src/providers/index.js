/**
 * Provider 注册表
 * 加载所有内置的 AI 平台 Provider 定义，以及用户导入的自定义 Provider。
 * 内置 provider 采用容错加载：单个文件缺失/损坏不会拖垮整个应用。
 */
import { loadCustomProviders } from './custom/loader.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const BUILTIN_PROVIDER_NAMES = ['deepseek', 'claude', 'chatgpt'];

function loadBuiltinProviders() {
  const list = [];
  for (const name of BUILTIN_PROVIDER_NAMES) {
    try {
      const mod = require('./' + name + '.js');
      const p = mod[name];
      if (p && p.id) list.push(p);
      else console.warn('[Provider] 内置 provider 无效，跳过:', name);
    } catch (err) {
      console.warn('[Provider] 内置 provider 加载失败，跳过:', name, err && err.message);
    }
  }
  return list;
}

const builtinProviders = loadBuiltinProviders();

function getAllProviders() {
  return [...builtinProviders, ...loadCustomProviders()];
}

function getProvider(id) {
  return getAllProviders().find((p) => p.id === id) || null;
}

/** 根据 URL 自动识别所属平台 */
function getProviderByUrl(url) {
  if (!url) return null;
  return getAllProviders().find((p) => typeof p.matchesUrl === 'function' && p.matchesUrl(url)) || null;
}

const providers = getAllProviders();

export { providers, getProvider, getAllProviders, getProviderByUrl };
