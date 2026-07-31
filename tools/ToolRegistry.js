/**
 * 工具注册表 - 管理所有可用工具
 */

class Tool {
  constructor(name, description, parameters) {
    this.name = name;
    this.description = description;
    this.parameters = parameters; // JSON Schema 格式
  }

  async execute(params) {
    throw new Error('execute() 必须由子类实现');
  }

  /**
   * 获取工具描述，用于发送给 AI
   */
  getDescription() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters
    };
  }
}

class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  /**
   * 注册工具
   * @param {Tool} tool - 工具实例
   */
  register(tool) {
    if (!tool || !tool.name) {
      throw new Error('工具必须有 name 属性');
    }
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] 工具 ${tool.name} 已存在，将被覆盖`);
    }
    this.tools.set(tool.name, tool);
    console.log(`[ToolRegistry] 注册工具: ${tool.name}`);
  }

  /**
   * 获取工具
   * @param {string} name - 工具名称
   * @returns {Tool|undefined}
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * 执行工具
   * @param {string} name - 工具名称
   * @param {Object} params - 参数
   * @returns {Promise<ToolResult>}
   */
  async execute(name, params) {
    const tool = this.tools.get(name);
    if (!tool) {
      return ToolResult.error(`未找到工具: ${name}`);
    }
    try {
      // 验证参数（可选，这里简化处理）
      return await tool.execute(params);
    } catch (err) {
      return ToolResult.error(`工具执行失败: ${err.message}`);
    }
  }

  /**
   * 获取所有工具描述
   * @returns {Array}
   */
  getDescriptions() {
    return Array.from(this.tools.values()).map(t => t.getDescription());
  }

  /**
   * 获取格式化的工具列表，用于 Prompt
   * @returns {string}
   */
  getFormattedToolsForPrompt() {
    const descriptions = this.getDescriptions();
    if (descriptions.length === 0) return '暂无可用工具';

    return descriptions.map((t, i) => {
      const params = t.parameters.properties ? Object.keys(t.parameters.properties).join(', ') : '无';
      return `${i + 1}. **${t.name}** - ${t.description}\n   参数: ${params}`;
    }).join('\n\n');
  }

  /**
   * 获取工具数量
   * @returns {number}
   */
  size() {
    return this.tools.size;
  }

  /**
   * 列出所有工具名称
   * @returns {string[]}
   */
  listNames() {
    return Array.from(this.tools.keys());
  }
}

/**
 * 统一的工具执行结果
 */
class ToolResult {
  constructor(success, data, error) {
    this.success = success;
    this.data = data;
    this.error = error;
  }

  static success(data) {
    return new ToolResult(true, data, null);
  }

  static error(error) {
    return new ToolResult(false, null, error);
  }

  toString() {
    if (this.success) {
      return `✅ 成功: ${JSON.stringify(this.data)}`;
    } else {
      return `❌ 失败: ${this.error}`;
    }
  }
}

module.exports = { Tool, ToolRegistry, ToolResult };