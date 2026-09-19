/**
 * 工具注册表 - 管理所有可用工具
 */

/** 工具系统提示词 section（仿 dsh 的 ctx.systemPrompt.section） */
interface PromptSection {
  name: string;
  order: number;
  text: string;
}

/** 工具描述（用于发送给 AI） */
interface ToolDescription {
  name: string;
  description: string;
  parameters: any;
  jsApi: string | null;
}

class Tool {
  name: string;
  description: string;
  parameters: any; // JSON Schema 格式
  jsApi: string | null; // JS 调用签名，如 'editFile(file_path, old_string, new_string)'

  constructor(name: string, description: string, parameters: any, jsApi?: string | null) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.jsApi = jsApi || null;
  }

  async execute(params: any): Promise<ToolResult> {
    throw new Error('execute() 必须由子类实现');
  }

  /**
   * 获取工具描述，用于发送给 AI
   */
  getDescription(): ToolDescription {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
      jsApi: this.jsApi
    };
  }

  /**
   * 获取工具的系统提示词 section（仿 dsh 的 ctx.systemPrompt.section）。
   * 返回 { name, order, text } 或 null（默认无 section）。
   * 子类可覆写此方法贡献工具使用指导。
   */
  getPromptSection(): PromptSection | null {
    return null;
  }
}

class ToolRegistry {
  tools: Map<string, Tool>;

  constructor() {
    this.tools = new Map();
  }

  /**
   * 注册工具
   * @param tool - 工具实例
   */
  register(tool: Tool): void {
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
   * @param name - 工具名称
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 执行工具
   * @param name - 工具名称
   * @param params - 参数
   */
  async execute(name: string, params: any): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return ToolResult.error(`未找到工具: ${name}`);
    }
    try {
      // 验证参数（可选，这里简化处理）
      return await tool.execute(params);
    } catch (err: any) {
      return ToolResult.error(`工具执行失败: ${err.message}`);
    }
  }

  /**
   * 获取所有工具描述
   */
  getDescriptions(): ToolDescription[] {
    return Array.from(this.tools.values()).map(t => t.getDescription());
  }

  /**
   * 获取格式化的工具列表，用于 Prompt
   */
  getFormattedToolsForPrompt(): string {
    const descriptions = this.getDescriptions();
    if (descriptions.length === 0) return '暂无可用工具';

    return descriptions.map((t, i) => {
      const params = t.parameters.properties ? Object.keys(t.parameters.properties).join(', ') : '无';
      return `${i + 1}. **${t.name}** - ${t.description}\n   参数: ${params}`;
    }).join('\n\n');
  }

  /**
   * 获取工具数量
   */
  size(): number {
    return this.tools.size;
  }

  /**
   * 列出所有工具名称
   */
  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 获取格式化的 JS API 列表，用于 Prompt（AI 生成 JS 代码调用这些函数）
   */
  getFormattedJsApiForPrompt(): string {
    const descriptions = this.getDescriptions().filter((t) => t.jsApi);
    if (descriptions.length === 0) return '暂无可用工具';

    return descriptions.map((t, i) => {
      const sig = '`' + t.jsApi + '`';
      return (i + 1) + '. ' + sig + ' — ' + t.description;
    }).join('\n');
  }

  /**
   * 收集所有工具的系统提示词 section，按 order 升序排列。
   * 仿 dsh 的 systemPrompt section 机制。
   */
  getPromptSections(): PromptSection[] {
    const sections: PromptSection[] = [];
    for (const tool of this.tools.values()) {
      const section = tool.getPromptSection();
      if (section && typeof section.text === 'string' && section.text.trim().length > 0) {
        sections.push({
          name: section.name || ('tool:' + tool.name),
          order: typeof section.order === 'number' ? section.order : 100,
          text: section.text
        });
      }
    }
    sections.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    return sections;
  }

  /**
   * 获取格式化后的工具使用指导（所有 section 文本拼接）。
   */
  getFormattedPromptSections(): string {
    const sections = this.getPromptSections();
    if (sections.length === 0) return '';
    return sections.map(s => s.text).join('\n\n');
  }
}

/**
 * 统一的工具执行结果
 */
class ToolResult {
  success: boolean;
  data: any;
  error: any;

  constructor(success: boolean, data: any, error: any) {
    this.success = success;
    this.data = data;
    this.error = error;
  }

  static success(data: any): ToolResult {
    return new ToolResult(true, data, null);
  }

  static error(error: any): ToolResult {
    return new ToolResult(false, null, error);
  }

  toString(): string {
    if (this.success) {
      return `✅ 成功: ${JSON.stringify(this.data)}`;
    } else {
      return `❌ 失败: ${this.error}`;
    }
  }
}

export { Tool, ToolRegistry, ToolResult };
export type { PromptSection, ToolDescription };
