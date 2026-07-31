/**
 * 统一工具系统 - 核心模块
 * 基于 FileWriteTool.js 规范，支持动态注册、验证、执行工具
 */

const { ToolRegistry, Tool, ToolResult } = require('./ToolRegistry');
const { FileWriteTool } = require('./FileWriteTool');

/**
 * 统一工具管理器
 * 负责工具注册、调用格式标准化、参数验证、执行分发
 */
class UnifiedToolManager {
  constructor() {
    this.registry = new ToolRegistry();
    this.registerBuiltinTools();
  }

  /**
   * 注册内置工具
   */
  registerBuiltinTools() {
    this.register(new FileWriteTool());
  }

  /**
   * 注册工具
   * @param {Tool} tool - 工具实例
   */
  register(tool) {
    this.registry.register(tool);
  }

  /**
   * 获取工具列表（用于发送给 AI 的 Prompt）
   * @returns {string} 格式化的工具列表
   */
  getToolsDescription() {
    return this.registry.getFormattedToolsForPrompt();
  }

  /**
   * 获取工具的 JSON Schema（用于验证）
   * @returns {Object} 所有工具的 Schema 映射
   */
  getToolsSchema() {
    const schemas = {};
    for (const [name, tool] of this.registry.tools) {
      schemas[name] = tool.parameters;
    }
    return schemas;
  }

  /**
   * 标准化工具调用格式
   * 支持多种输入格式，统一转换为标准格式
   *
   * 标准格式：
   * {
   *   "toolName": "file_write",
   *   "params": { "file_path": "...", "content": "..." },
   *   "callId": "call_xxx"
   * }
   *
   * @param {string|Object} input - 原始输入
   * @returns {Object|null} 标准化后的工具调用，失败返回 null
   */
  parseToolCall(input) {
    if (!input) return null;

    let parsed = null;

    // 1. 如果已经是对象，尝试直接使用
    if (typeof input === 'object' && input !== null) {
      parsed = input;
    }
    // 2. 如果是字符串，尝试解析 JSON
    else if (typeof input === 'string') {
      const str = input.trim();

      // 尝试提取 ```tool 或 ```json 代码块中的内容
      const codeBlockMatch = str.match(/^```(?:tool|json)?\s*\n?(\{[\s\S]*\})\s*```?$/);
      if (codeBlockMatch) {
        try {
          parsed = JSON.parse(codeBlockMatch[1]);
        } catch (e) {
          return null;
        }
      } else {
        // 直接尝试解析整个字符串
        try {
          parsed = JSON.parse(str);
        } catch (e) {
          return null;
        }
      }
    }

    if (!parsed) return null;

    // 验证必要字段
    if (!parsed.toolName || typeof parsed.toolName !== 'string') {
      return null;
    }

    // 标准化输出
    return {
      toolName: parsed.toolName,
      params: parsed.params || parsed.parameters || parsed.arguments || {},
      callId: parsed.callId || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  /**
   * 验证工具调用参数
   * @param {string} toolName - 工具名称
   * @param {Object} params - 参数对象
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validateParams(toolName, params) {
    const tool = this.registry.get(toolName);
    if (!tool) {
      return { valid: false, errors: [`未知工具: ${toolName}`] };
    }

    const schema = tool.parameters;
    if (!schema || !schema.properties) {
      return { valid: true, errors: [] };
    }

    const errors = [];
    const required = schema.required || [];

    // 检查必填字段
    for (const field of required) {
      if (params[field] === undefined || params[field] === null) {
        errors.push(`缺少必填参数: ${field}`);
      }
    }

    // 检查字段类型
    for (const [key, value] of Object.entries(params)) {
      const propSchema = schema.properties[key];
      if (!propSchema) continue; // 允许额外字段

      if (propSchema.type === 'string' && typeof value !== 'string') {
        errors.push(`参数 ${key} 必须是字符串`);
      } else if (propSchema.type === 'number' && typeof value !== 'number') {
        errors.push(`参数 ${key} 必须是数字`);
      } else if (propSchema.type === 'boolean' && typeof value !== 'boolean') {
        errors.push(`参数 ${key} 必须是布尔值`);
      } else if (propSchema.type === 'object' && typeof value !== 'object') {
        errors.push(`参数 ${key} 必须是对象`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 执行工具调用
   * @param {Object} toolCall - 标准化的工具调用对象
   * @returns {Promise<ToolResult>}
   */
  async execute(toolCall) {
    const { toolName, params, callId } = toolCall;

    // 验证参数
    const validation = this.validateParams(toolName, params);
    if (!validation.valid) {
      return ToolResult.error(`参数验证失败: ${validation.errors.join(', ')}`);
    }

    // 执行工具
    return this.registry.execute(toolName, params);
  }

  /**
   * 获取工具定义（用于生成系统提示词）
   * @returns {Array} 工具定义数组
   */
  getToolDefinitions() {
    return Array.from(this.registry.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }

  /**
   * 生成给 AI 的完整工具使用说明
   * @returns {string}
   */
  generateSystemPrompt() {
    const tools = this.getToolDefinitions();
    let prompt = '# 可用工具\n\n';

    for (const tool of tools) {
      prompt += `## ${tool.name}\n`;
      prompt += `${tool.description}\n\n`;

      if (tool.parameters && tool.parameters.properties) {
        prompt += '**参数：**\n';
        for (const [key, schema] of Object.entries(tool.parameters.properties)) {
          const required = tool.parameters.required?.includes(key) ? ' (必填)' : ' (选填)';
          prompt += `- \`${key}\`${required}: ${schema.description} (类型: ${schema.type})\n`;
        }
        prompt += '\n';
      }

      prompt += '---\n\n';
    }

    prompt += `## 调用格式\n\n请使用以下格式调用工具（仅输出 JSON，不要包含其他文字）：\n\n`;
    prompt += `\`\`\`json\n{\n  "toolName": "工具名称",\n  "params": {\n    "参数名": "参数值"\n  },\n  "callId": "call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}"\n}\n\`\`\`\n`;

    return prompt;
  }
}

module.exports = { UnifiedToolManager };

// 创建全局实例
const toolManager = new UnifiedToolManager();
module.exports.toolManager = toolManager;