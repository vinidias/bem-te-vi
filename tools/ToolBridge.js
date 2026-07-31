/**
 * 工具桥接器 - 在 preload 中使用
 * 连接 WebContentCapturer、UnifiedToolManager 和 Electron IPC
 */

const { toolManager } = require('./UnifiedToolManager');
const { WebContentCapturer } = require('./WebContentCapturer');

class ToolBridge {
  constructor() {
    this.capturer = null;
    this.isInitialized = false;
  }

  /**
   * 初始化桥接器
   * @param {Object} electronAPI - electronAPI 对象
   */
  init(electronAPI) {
    if (this.isInitialized) return;

    this.electronAPI = electronAPI;
    this.capturer = new WebContentCapturer(toolManager);

    // 设置工具调用处理器
    this.capturer.setToolCallHandler(async (toolCall) => {
      console.log('[ToolBridge] 执行工具调用:', toolCall);
      const result = await toolManager.execute(toolCall);

      // 通过 IPC 发送结果到主进程（可选，用于日志/历史记录）
      if (this.electronAPI && this.electronAPI.executeTool) {
        await this.electronAPI.executeTool({
          toolName: toolCall.toolName,
          params: toolCall.params,
          callId: toolCall.callId
        });
      }

      return result;
    });

    // 设置消息处理器
    this.capturer.setMessageHandler((content, role) => {
      console.log('[ToolBridge] 新消息:', role, content.substring(0, 100));
    });

    this.isInitialized = true;
    console.log('[ToolBridge] 初始化完成');
  }

  /**
   * 启动内容捕获
   */
  startCapturing() {
    if (this.capturer) {
      this.capturer.start();
    }
  }

  /**
   * 停止内容捕获
   */
  stopCapturing() {
    if (this.capturer) {
      this.capturer.stop();
    }
  }

  /**
   * 手动触发工具调用解析（用于测试）
   * @param {string} content
   */
  async testParseToolCall(content) {
    if (!this.capturer) return null;
    return this.capturer.parseToolCall(content);
  }

  /**
   * 获取工具系统提示词
   * @returns {string}
   */
  getSystemPrompt() {
    return toolManager.generateSystemPrompt();
  }

  /**
   * 获取工具列表描述
   * @returns {string}
   */
  getToolsDescription() {
    return toolManager.getToolsDescription();
  }
}

// 创建全局实例
const toolBridge = new ToolBridge();

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ToolBridge, toolBridge };
} else {
  window.ToolBridge = ToolBridge;
  window.toolBridge = toolBridge;
}