const { Tool, ToolResult } = require('./ToolRegistry');
const windowManager = require('./browser-window-manager');

class InjectJSTool extends Tool {
  constructor() {
    super(
      'inject_js',
      '向指定窗口注入 JS 代码并返回执行结果（代码自动包装为 async，支持 await 和 return）',
      {
        type: 'object',
        properties: {
          windowId: { type: 'string', description: '目标窗口 ID' },
          code: { type: 'string', description: '要注入的 JS 代码（支持 await/return，返回值会返回给 AI）' }
        },
        required: ['windowId', 'code'],
        additionalProperties: false
      },
      'injectJS(windowId, code)'
    );
  }

  getPromptSection() {
    return {
      name: 'tool:inject_js',
      order: 113,
      text: '使用 injectJS(windowId, code) 向指定窗口注入 JS。代码自动包装为 async 函数，用 return 返回同步值、用 await 等待异步结果。执行出错会抛出异常。'
    };
  }

  async execute(params) {
    const { windowId, code } = params;
    const result = await windowManager.injectJS(windowId, code);
    return ToolResult.success(result);
  }
}

module.exports = { InjectJSTool };
