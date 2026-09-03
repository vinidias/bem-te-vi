/**
 * Provider 注册表
 * 加载所有内置的 AI 平台 Provider 定义。
 */
const deepseek = require('./deepseek');
const claude = require('./claude');

const providers = [deepseek, claude];

function getProvider(id) {
  return providers.find((p) => p.id === id) || null;
}

function getAllProviders() {
  return providers;
}

/** 根据 URL 自动识别所属平台 */
function getProviderByUrl(url) {
  if (!url) return null;
  return providers.find((p) => p.matchesUrl(url)) || null;
}

module.exports = {
  providers,
  getProvider,
  getAllProviders,
  getProviderByUrl,
};
