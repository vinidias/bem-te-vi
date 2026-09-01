/**
 * DeepSeek Provider 定义
 * 包含主进程和 preload 都需要的信息：
 * - 主进程：homeUrl（打开窗口）、sessionUrlBase（导航到会话）
 * - preload：输入框/发送按钮选择器、用户信息选择器、首页判断正则
 */
module.exports = {
  id: 'deepseek',
  name: 'DeepSeek',
  homeUrl: 'https://chat.deepseek.com/',
  sessionUrlBase: 'https://chat.deepseek.com/a/chat/s/',

  // 输入框查找选择器（按优先级排序）
  inputSelectors: [
    'textarea[placeholder*="message"]',
    'textarea[placeholder*="Message"]',
    'textarea[placeholder*="输入"]',
    'textarea[placeholder*="输入消息"]',
    'textarea[placeholder*="ask"]',
    'textarea[placeholder*="Ask"]',
    'textarea[placeholder*="提问"]',
    'textarea[placeholder*="发送"]',
    'textarea[placeholder*="send"]',
    'textarea[placeholder*="deepseek"]',
    'textarea[placeholder*="DeepSeek"]',
    'textarea.chat-input',
    'textarea',
    'div[contenteditable="true"]',
    '[role="textbox"]',
  ],

  // 输入框关键词兜底匹配
  inputKeywords: ['deepseek', 'message', 'ask', 'send', '输入', '提问', '发送'],

  // 发送按钮选择器
  sendButtonSelectors: [
    'button[type="submit"]',
    'button[aria-label*="send"]',
    'button[aria-label*="发送"]',
    'button[title*="send"]',
    'button[title*="发送"]',
    'button[data-action="send"]',
    'button[data-type="send"]',
    '.send-btn',
    '.submit-btn',
    'button svg[data-icon="send"]',
    '[data-testid="send"]',
    '[data-testid="send-button"]',
    'button:has(svg[data-icon="arrow"])',
    'button:has(> svg)',
    'button:has(svg[data-icon="send"])',
  ],

  // 用户信息选择器（脱敏手机号/微信昵称）
  userInfoSelector: '._9d8da05',

  // 首页判断正则（用于覆盖层首页模式）
  homeUrlPattern: /^https:\/\/chat\.deepseek\.com\/?(\?.*)?$/,

  // 从 URL 提取会话 ID
  extractSessionId(url) {
    if (!url) return null;
    const match = url.match(/\/chat\/s\/([a-f0-9-]+)/i);
    if (match) return match[1];
    const altMatch = url.match(/\/s\/([a-f0-9-]+)/i);
    return altMatch ? altMatch[1] : null;
  },

  // 判断 URL 是否属于本平台
  matchesUrl(url) {
    return url.includes('chat.deepseek.com');
  },
};
