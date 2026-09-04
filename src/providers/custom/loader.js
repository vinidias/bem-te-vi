/**
 * 自定义 Provider 加载器
 * 从持久化配置读取用户导入的 Provider JS 文件路径，加载并注册。
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CUSTOM_CONFIG_FILE = 'custom-providers.json';

function getConfigPath() {
  return path.join(app.getPath('userData'), CUSTOM_CONFIG_FILE);
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

function addCustomProviderPath(filePath) {
  const config = readConfig();
  if (!config.paths) config.paths = [];
  if (!config.paths.includes(filePath)) {
    config.paths.push(filePath);
    writeConfig(config);
  }
}

function removeCustomProviderPath(filePath) {
  const config = readConfig();
  config.paths = (config.paths || []).filter(p => p !== filePath);
  writeConfig(config);
}

module.exports = {
  loadCustomProviders,
  addCustomProviderPath,
  removeCustomProviderPath,
  readConfig,
};
