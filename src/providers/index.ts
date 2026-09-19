/**
 * Provider 注册表
 * 加载所有内置的 AI 平台 Provider 定义，以及用户导入的自定义 Provider。
 */
import { loadCustomProviders } from './custom/loader.js';
import { deepseek } from './deepseek.js';
import { claude } from './claude.js';
import { chatgpt } from './chatgpt.js';

const builtinProviders = [deepseek, claude, chatgpt].filter((p) => p && p.id);

function getAllProviders(): any[] {
  return [...builtinProviders, ...loadCustomProviders()];
}

function getProvider(id: string): any {
  return getAllProviders().find((p) => p.id === id) || null;
}

/** 根据 URL 自动识别所属平台 */
function getProviderByUrl(url: string): any {
  if (!url) return null;
  return getAllProviders().find((p) => typeof p.matchesUrl === 'function' && p.matchesUrl(url)) || null;
}

const providers = getAllProviders();

export { providers, getProvider, getAllProviders, getProviderByUrl };
