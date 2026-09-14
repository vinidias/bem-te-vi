/**
 * Token 估算（近似）
 * 依据 DeepSeek 官方启发式规则：
 *   1 个 CJK 字符 ≈ 0.6 token，1 个 ASCII 字符 ≈ 0.3 token。
 * 纯函数、零依赖，供输入框 token 计数等场景复用。
 */

/**
 * 估算文本的 token 数（浮点 unit）
 * @param {string} text
 * @returns {number}
 */
function estimateTokenUnits(text) {
  if (!text) return 0;
  let tokens = 0;
  for (const char of text) {
    tokens += char.charCodeAt(0) > 0x7F ? 0.6 : 0.3;
  }
  return tokens;
}

/**
 * 估算文本的 token 数（向上取整）
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  return Math.ceil(estimateTokenUnits(text));
}

module.exports = { estimateTokenUnits, estimateTokens };
