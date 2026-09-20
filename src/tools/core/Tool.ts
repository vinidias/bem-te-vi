/**
 * 工具基类
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
  jsApi: string | null; // JS 调用签名

  constructor(name: string, description: string, parameters: any, jsApi?: string | null) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.jsApi = jsApi || null;
  }

  async execute(params: any): Promise<any> {
    throw new Error('execute() 必须由子类实现');
  }

  /** 获取工具描述，用于发送给 AI */
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
   */
  getPromptSection(): PromptSection | null {
    return null;
  }
}

export { Tool };
export type { PromptSection, ToolDescription };
