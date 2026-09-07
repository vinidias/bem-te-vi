/**
 * 自定义 Provider 加载器
 * 导入时复制文件到 userData/custom-providers/，避免源文件被删后失效。
 * 删除时同时清理配置文件中的记录和复制到 userData 下的副本。
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CUSTOM_CONFIG_FILE = 'custom-providers.json';
const CUSTOM_PROVIDERS_DIR = 'custom-providers';

function getConfigPath() {
  return path.join(app.getPath('userData'), CUSTOM_CONFIG_FILE);
}

function getCustomProvidersDir() {
  return path.join(app.getPath('userData'), CUSTOM_PROVIDERS_DIR);
}

function ensureCustomProvidersDir() {
  const dir = getCustomProvidersDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function readConfig() {
  try {
    const file = getConfigPath();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (err) {
    console.error('[CustomProvider] 读取配置失败:', err.message);
  }
  return { paths: [] };
}

function writeConfig(config) {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('[CustomProvider] 写入配置失败:', err.message);
  }
}

function validateProvider(p) {
  if (!p || typeof p !== 'object') return '必须是对象';
  if (!p.id || typeof p.id !== 'string') return '缺少 id';
  if (!p.name || typeof p.name !== 'string') return '缺少 name';
  if (!p.homeUrl || typeof p.homeUrl !== 'string') return '缺少 homeUrl';
  if (typeof p.matchesUrl !== 'function') return '缺少 matchesUrl 方法';
  if (typeof p.extractSessionId !== 'function') return '缺少 extractSessionId 方法';
  return null;
}

function loadProviderFromFile(filePath) {
  const provider = require(filePath);
  const error = validateProvider(provider);
  if (error) throw new Error(error);
  return provider;
}

function loadCustomProviders() {
  const config = readConfig();
  const providers = [];
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
      console.log('[CustomProvider] 已加载:', provider.id, '来自', p);
    } catch (err) {
      console.error('[CustomProvider] 加载失败:', p, err.message);
    }
  }
  return providers;
}

/**
 * 导入自定义 Provider 文件
 * @param {string} sourcePath 用户选择的源文件路径
 * @param {{ replace?: boolean }} options
 * @returns {{ exists: true, provider: object, targetPath: string } | { success: true, provider: object, targetPath: string }}
 */
function importCustomProvider(sourcePath, options = {}) {
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

  return { success: true, targetPath, provider };
}

/**
 * 替换自定义 Provider
 * @param {string} targetProviderId 旧 provider 的 id
 * @param {string} newSourcePath 新文件路径
 * @returns {{ success: true, targetPath, provider }}
 * @throws {Error} 新文件 id 与旧 id 不一致时抛错
 */
function replaceCustomProvider(targetProviderId, newSourcePath) {
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
function removeCustomProviderPath(filePath) {
  const config = readConfig();
  config.paths = (config.paths || []).filter(p => p !== filePath);
  writeConfig(config);

  const dir = getCustomProvidersDir();
  if (filePath && filePath.startsWith(dir + path.sep) && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log('[CustomProvider] 已删除文件:', filePath);
    } catch (err) {
      console.error('[CustomProvider] 删除文件失败:', filePath, err.message);
    }
  }
}

module.exports = {
  loadCustomProviders,
  importCustomProvider,
  replaceCustomProvider,
  removeCustomProviderPath,
  readConfig,
};
