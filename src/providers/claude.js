/**
 * Claude Provider 定义
 * 基于 claude.ai 页面结构，输入框为 ProseMirror（contenteditable）。
 */
module.exports = {
  id: 'claude',
  name: 'Claude',
  homeUrl: 'https://claude.ai/new',
  sessionUrlBase: 'https://claude.ai/chat/',

  // 输入框选择器（Claude 用 ProseMirror contenteditable，不是 textarea）
  inputSelectors: [
    'div[role="textbox"].tiptap',
    'div[role="textbox"]',
    'div.ProseMirror',
    'div[contenteditable="true"]',
    'textarea',
  ],

  // 输入框关键词兜底匹配
  inputKeywords: ['claude', 'message', 'ask', 'send', '输入', '提问', '发送'],

  // 发送按钮选择器
  sendButtonSelectors: [
    'button[aria-label="Send message"]',
    '[data-testid="chat-input-send"]',
    'button[aria-label*="send"]',
    'button[aria-label*="Send"]',
  ],

  // 用户信息选择器（左下角账号名）
  userInfoSelector: '.df-user-menu-btn span.whitespace-nowrap.text-secondary',

  // 首页判断正则（https://claude.ai/new 或 https://claude.ai/）
  homeUrlPattern: /^https:\/\/claude\.ai(\/new)?\/?(\?.*)?$/,

  // 从 URL 提取会话 ID（Claude 是 /chat/xxx 格式）
  extractSessionId(url) {
    if (!url) return null;
    const match = url.match(/\/chat\/([a-zA-Z0-9_-]+)/i);
    if (match) return match[1];
    return null;
  },

  // 判断 URL 是否属于本平台
  matchesUrl(url) {
    return url.includes('claude.ai');
  },
};
