/**
 * 自定义 Provider 加载器
 * 导入时复制文件到 userData/custom-providers/，避免源文件被删后失效。
 * 删除时同时清理配置文件中的记录和复制到 userData 下的副本。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { validateProvider } from '../validate.js';

const require = createRequire(import.meta.url);
const { app } = require('electron');

const isRenderer = process.type === 'renderer';

// 渲染进程从主进程注入的 additionalArguments 参数中读取 userData 路径
// （electron.app 在渲染进程为 undefined，无法通过 app.getPath 获取）
let rendererUserDataPath: string | null = null;
if (isRenderer) {
  const argv = process.argv || [];
  const arg = argv.find(a => a.startsWith('--cuckoo-user-data='));
  if (arg) rendererUserDataPath = arg.slice('--cuckoo-user-data='.length);
}

function getUserDataPath(): string | null {
  if (isRenderer && rendererUserDataPath) return rendererUserDataPath;
  if (app && typeof app.getPath === 'function') return app.getPath('userData');
  return null;
}

const CUSTOM_CONFIG_FILE = 'custom-providers.json';
const CUSTOM_PROVIDERS_DIR = 'custom-providers';

function getConfigPath(): string | null {
  const userData = getUserDataPath();
  if (!userData) return null;
  return path.join(userData, CUSTOM_CONFIG_FILE);
}

function getCustomProvidersDir(): string | null {
  const userData = getUserDataPath();
  if (!userData) return null;
  return path.join(userData, CUSTOM_PROVIDERS_DIR);
}

function ensureCustomProvidersDir(): string {
  const dir = getCustomProvidersDir();
  if (!fs.existsSync(dir as string)) {
    fs.mkdirSync(dir as string, { recursive: true });
  }
  return dir as string;
}

interface CustomProviderConfig {
  paths: string[];
}

function readConfig(): CustomProviderConfig {
  if (isRenderer && !rendererUserDataPath) return { paths: [] };
  try {
    const file = getConfigPath();
    if (file && fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (err: any) {
    console.error('[CustomProvider] 读取配置失败:', err.message);
  }
  return { paths: [] };
}

function writeConfig(config: CustomProviderConfig): void {
  try {
    fs.writeFileSync(getConfigPath() as string, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err: any) {
    console.error('[CustomProvider] 写入配置失败:', err.message);
  }
}

function loadProviderFromFile(filePath: string): any {
  const provider = require(filePath);
  const error = validateProvider(provider);
  if (error) throw new Error(error);
  return provider;
}

// 自定义 Provider 缓存：getProviderByUrl 会被高频调用（轮询、DOM 检测等），
// 若每次都重新读配置 + require 文件会刷屏日志并浪费性能。
// 缓存挂在 process 上：preload 在多个 frame / 多次导航时模块可能被重新求值，
// 模块级变量会失效，而 process 在同一渲染进程内始终共享。
// 缓存按 userData 路径分桶，路径变化时自动失效。
// 仅在导入/替换/删除时失效。
function getCurrentCacheKey(): string {
  return getUserDataPath() || '__none__';
}

interface CacheHolder {
  key: string;
  providers: any[] | null;
}

function getCacheHolder(): CacheHolder {
  const key = getCurrentCacheKey();
  const proc = process as any;
  if (!proc.__cuckooCustomProvidersCache ||
      proc.__cuckooCustomProvidersCache.key !== key) {
    proc.__cuckooCustomProvidersCache = { key, providers: null };
  }
  return proc.__cuckooCustomProvidersCache;
}

function invalidateCustomProvidersCache(): void {
  getCacheHolder().providers = null;
}

function loadCustomProviders(): any[] {
  if (isRenderer && !rendererUserDataPath) return [];
  const cache = getCacheHolder();
  if (cache.providers) return cache.providers;
  const config = readConfig();
  const providers: any[] = [];
  for (const p of config.paths || []) {
    try {
      if (!fs.existsSync(p)) {
        console.warn('[CustomProvider] 文件不存在，跳过:', p);
        continue;
      }
      const provider = require(p);
      const error = validateProvider(provider);
      if (error) {
        console.warn('[CustomProvider] 校验失败:', p, error);
        continue;
      }
      provider._customPath = p;
      providers.push(provider);
    } catch (err: any) {
      console.error('[CustomProvider] 加载失败:', p, err.message);
    }
  }
  cache.providers = providers;
  return providers;
}

/**
 * 导入自定义 Provider 文件
 * @param sourcePath 用户选择的源文件路径
 * @param options
 */
function importCustomProvider(sourcePath: string, options: { replace?: boolean } = {}): any {
  const provider = loadProviderFromFile(sourcePath);
  const dir = ensureCustomProvidersDir();
  const targetPath = path.join(dir, provider.id + '.js');

  // 已存在且未要求替换
  if (fs.existsSync(targetPath) && !options.replace) {
    return { exists: true, targetPath, provider };
  }

  // 清理 require 缓存，确保替换后重新加载
  if (fs.existsSync(targetPath)) {
    try {
      delete require.cache[require.resolve(targetPath)];
    } catch (err) {
      // ignore
    }
  }

  // 复制到 userData/custom-providers/
  fs.copyFileSync(sourcePath, targetPath);

  // 写配置
  const config = readConfig();
  if (!config.paths) config.paths = [];
  if (!config.paths.includes(targetPath)) {
    config.paths.push(targetPath);
  }
  writeConfig(config);

  invalidateCustomProvidersCache();
  return { success: true, targetPath, provider };
}

/**
 * 替换自定义 Provider
 * @param targetProviderId 旧 provider 的 id
 * @param newSourcePath 新文件路径
 * @throws 新文件 id 与旧 id 不一致时抛错
 */
function replaceCustomProvider(targetProviderId: string, newSourcePath: string): any {
  const newProvider = loadProviderFromFile(newSourcePath);
  if (newProvider.id !== targetProviderId) {
    throw new Error(
      '新文件的 id 为 "' + newProvider.id + '"，但当前 Provider 的 id 是 "' +
      targetProviderId + '"，id 必须一致才能替换'
    );
  }
  return importCustomProvider(newSourcePath, { replace: true });
}

/**
 * 删除自定义 Provider
 * 同时从配置移除路径，并删除复制到 userData/custom-providers/ 下的文件。
 */
function removeCustomProviderPath(filePath: string): void {
  const config = readConfig();
  config.paths = (config.paths || []).filter(p => p !== filePath);
  writeConfig(config);
  invalidateCustomProvidersCache();

  const dir = getCustomProvidersDir();
  if (filePath && dir && filePath.startsWith(dir + path.sep) && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log('[CustomProvider] 已删除文件:', filePath);
    } catch (err: any) {
      console.error('[CustomProvider] 删除文件失败:', filePath, err.message);
    }
  }
}

export {
  loadCustomProviders,
  importCustomProvider,
  replaceCustomProvider,
  removeCustomProviderPath,
  readConfig,
};
