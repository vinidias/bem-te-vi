/**
 * 网页内容捕获器
 * 负责监听 DeepSeek 聊天页面，捕获 AI 回复并解析工具调用
 */

class WebContentCapturer {
  constructor(toolManager, options = {}) {
    this.toolManager = toolManager;
    this.options = {
      messageSelector: options.messageSelector || '.ds-markdown, .markdown-body, [data-testid="message"], .message-content',
      assistantSelector: options.assistantSelector || '[data-role="assistant"], .assistant-message, .bot-message',
      pollInterval: options.pollInterval || 2000,
      ...options
    };

    this.lastProcessedMessage = '';
    this.isRunning = false;
    this.pollTimer = null;
    this.onToolCall = null; // 回调函数
    this.onMessage = null;  // 新消息回调
  }

  /**
   * 设置工具调用回调
   * @param {Function} callback - (toolCall) => Promise<void>
   */
  setToolCallHandler(callback) {
    this.onToolCall = callback;
  }

  /**
   * 设置新消息回调
   * @param {Function} callback - (message, role) => void
   */
  setMessageHandler(callback) {
    this.onMessage = callback;
  }

  /**
   * 启动监听
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[WebCapturer] 开始监听网页内容...');
    this.poll();
  }

  /**
   * 停止监听
   */
  stop() {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('[WebCapturer] 停止监听');
  }

  /**
   * 轮询检查新消息
   */
  async poll() {
    if (!this.isRunning) return;

    try {
      await this.checkNewMessages();
    } catch (e) {
      console.error('[WebCapturer] 轮询出错:', e);
    }

    this.pollTimer = setTimeout(() => this.poll(), this.options.pollInterval);
  }

  /**
   * 检查新消息
   */
  async checkNewMessages() {
    const messages = this.extractMessages();
    if (!messages.length) return;

    // 获取最新的助手消息
    const lastAssistantMsg = this.getLastAssistantMessage(messages);
    if (!lastAssistantMsg) return;

    // 去重：只处理新消息
    const contentHash = this.hashContent(lastAssistantMsg.content);
    if (contentHash === this.lastProcessedMessage) return;
    this.lastProcessedMessage = contentHash;

    console.log('[WebCapturer] 发现新助手消息:', lastAssistantMsg.content.substring(0, 100));

    // 触发消息回调
    if (this.onMessage) {
      this.onMessage(lastAssistantMsg.content, 'assistant');
    }

    // 尝试解析工具调用
    const toolCall = this.parseToolCall(lastAssistantMsg.content);
    if (toolCall) {
      console.log('[WebCapturer] 检测到工具调用:', toolCall);
      if (this.onToolCall) {
        await this.onToolCall(toolCall);
      }
    }
  }

  /**
   * 提取页面所有消息
   * @returns {Array<{role: string, content: string, element: Element}>}
   */
  extractMessages() {
    const messages = [];

    // 尝试多种选择器策略
    const selectors = [
      // DeepSeek 可能的选择器
      '.ds-markdown',
      '.markdown-body',
      '[data-testid="message"]',
      '.message-content',
      '.chat-message',
      '[data-role]',
      '.assistant-message',
      '.bot-message'
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach(el => {
          const role = this.detectRole(el);
          const content = el.textContent || el.innerText || '';
          if (content.trim()) {
            messages.push({ role, content: content.trim(), element: el });
          }
        });
        if (messages.length > 0) break; // 找到一种匹配就停止
      }
    }

    return messages;
  }

  /**
   * 检测消息角色
   * @param {Element} el
   * @returns {'user'|'assistant'|'unknown'}
   */
  detectRole(el) {
    // 检查 data-role 属性
    const role = el.getAttribute('data-role');
    if (role === 'assistant' || role === 'bot') return 'assistant';
    if (role === 'user' || role === 'human') return 'user';

    // 检查 class
    const className = el.className || '';
    if (className.includes('assistant') || className.includes('bot')) return 'assistant';
    if (className.includes('user') || className.includes('human')) return 'user';

    // 检查父元素
    const parent = el.closest('[data-role], .message, .chat-message');
    if (parent) {
      const pRole = parent.getAttribute('data-role');
      if (pRole) return pRole;
      const pClass = parent.className || '';
      if (pClass.includes('assistant') || pClass.includes('bot')) return 'assistant';
      if (pClass.includes('user') || pClass.includes('human')) return 'user';
    }

    return 'unknown';
  }

  /**
   * 获取最新的助手消息
   * @param {Array} messages
   * @returns {Object|null}
   */
  getLastAssistantMessage(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return messages[i];
      }
    }
    return null;
  }

  /**
   * 解析工具调用
   * 支持多种格式：
   * 1. 标准格式: {"toolName": "...", "params": {...}, "callId": "..."}
   * 2. 代码块格式: ```json {...} ```
   * 3. tool 代码块: ```tool {...} ```
   * @param {string} content
   * @returns {Object|null}
   */
  parseToolCall(content) {
    if (!content || typeof content !== 'string') return null;

    const str = content.trim();

    // 1. 尝试直接解析 JSON
    let parsed = null;
    try {
      parsed = JSON.parse(str);
    } catch (e) {
      // 不是直接的 JSON，尝试提取代码块
    }

    // 2. 提取代码块
    if (!parsed) {
      // ```json ... ``` 或 ```tool ... ``` 或 ``` ... ```
      const codeBlockMatch = str.match(/^```(?:json|tool)?\s*\n?(\{[\s\S]*\})\s*```?$/);
      if (codeBlockMatch) {
        try {
          parsed = JSON.parse(codeBlockMatch[1]);
        } catch (e) {
          console.log('[WebCapturer] 代码块 JSON 解析失败:', e.message);
        }
      }
    }

    // 3. 尝试在文本中查找 JSON 对象
    if (!parsed) {
      const jsonMatch = str.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e) {
          // 忽略
        }
      }
    }

    if (!parsed) return null;

    // 验证必要字段 - 支持多种字段名
    if (!parsed.toolName && !parsed.tool) return null;

    // 标准化输出
    return {
      toolName: parsed.toolName || parsed.tool,
      params: parsed.params || parsed.parameters || parsed.arguments || {},
      callId: parsed.callId || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  /**
   * 简单哈希用于去重
   */
  hashContent(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebContentCapturer };
} else {
  window.WebContentCapturer = WebContentCapturer;
}