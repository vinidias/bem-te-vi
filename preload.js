const { contextBridge, ipcRenderer } = require('electron');

console.log('[Cuckoo Code] Preload script 开始执行');

// ========== 统一工具系统 (内联到 preload) ==========

/**
 * 工具执行结果封装类
 */
class ToolResult {
  /**
   * 创建一个工具执行结果实例
   * @param {boolean} success - 执行是否成功
   * @param {*} data - 执行成功时返回的数据
   * @param {string|null} error - 执行失败时的错误信息
   */
  constructor(success, data, error) {
    this.success = success;
    this.data = data;
    this.error = error;
  }

  /**
   * 创建一个成功的工具执行结果
   * @param {*} data - 执行返回的数据
   * @returns {ToolResult} 成功结果实例
   */
  static success(data) { return new ToolResult(true, data, null); }

  /**
   * 创建一个失败的工具执行结果
   * @param {string} error - 错误信息
   * @returns {ToolResult} 失败结果实例
   */
  static error(error) { return new ToolResult(false, null, error); }
}

/**
 * 统一工具管理器
 * 负责注册、管理、解析和执行所有工具调用
 */
class UnifiedToolManager {
  /**
   * 创建工具管理器实例，并自动注册内置工具
   */
  constructor() {
    this.tools = new Map();
    this.registerBuiltinTools();
  }

  /**
   * 注册所有内置工具
   * 包含：file_write、file_read、file_edit、file_glob、file_grep、bash
   */
  registerBuiltinTools() {
    this.register('file_write', {
      name: 'file_write',
      description: '创建新文件或覆盖已有文件。如果父目录不存在，会自动创建。',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '文件的绝对路径或相对路径' },
          content: { type: 'string', description: '要写入文件的内容' },
          encoding: { type: 'string', description: '文件编码，默认 utf-8', default: 'utf-8' }
        },
        required: ['file_path', 'content'],
        additionalProperties: false
      }
    });
    this.register('file_read', {
      name: 'file_read',
      description: '读取指定文件的内容。如果文件不存在或读取失败，会返回错误信息。',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '文件的相对路径或绝对路径' },
          encoding: { type: 'string', description: '文件编码，默认 utf-8', default: 'utf-8' }
        },
        required: ['file_path'],
        additionalProperties: false
      }
    });
    this.register('file_edit', {
      name: 'file_edit',
      description: '在文件中精确查找一段文本并替换为新文本（old_string → new_string），用于修改文件部分内容。',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '文件的相对路径或绝对路径' },
          old_string: { type: 'string', description: '要查找的旧文本，必须精确匹配文件内容' },
          new_string: { type: 'string', description: '要替换成的新文本' },
          replace_all: { type: 'boolean', description: '出现多次时是否全部替换，默认 false', default: false }
        },
        required: ['file_path', 'old_string', 'new_string'],
        additionalProperties: false
      }
    });
    this.register('file_glob', {
      name: 'file_glob',
      description: '按 glob 模式递归搜索项目中的文件，返回匹配的文件相对路径列表。',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'glob 匹配模式，如 **/*.java、src/**/*.js、*.json' },
          path: { type: 'string', description: '搜索的起始目录（相对路径），默认项目根目录' }
        },
        required: ['pattern'],
        additionalProperties: false
      }
    });
    this.register('file_grep', {
      name: 'file_grep',
      description: '在项目文件中按正则表达式或文本搜索内容，返回匹配的文件、行号和行内容。',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '要搜索的正则表达式或纯文本' },
          path: { type: 'string', description: '搜索的起始目录（相对路径），默认项目根目录' },
          glob: { type: 'string', description: '限定搜索的文件类型，如 *.java、**/*.js（可选）' },
          ignore_case: { type: 'boolean', description: '忽略大小写，默认 false', default: false },
          output_mode: { type: 'string', description: 'content（输出匹配行）或 count（仅统计数量），默认 content', default: 'content' },
          context: { type: 'number', description: '匹配行前后各输出的上下文行数，默认 0', default: 0 }
        },
        required: ['pattern'],
        additionalProperties: false
      }
    });
    this.register('bash', {
      name: 'bash',
      description: '执行 shell 命令（Windows 使用 cmd.exe），返回 stdout/stderr 输出。可用于查看目录、运行构建、安装依赖、git 操作等。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的 shell 命令' },
          cwd: { type: 'string', description: '命令的工作目录（相对路径），默认项目根目录' },
          timeout: { type: 'number', description: '超时时间（毫秒），默认 30000', default: 30000 }
        },
        required: ['command'],
        additionalProperties: false
      }
    });
  }

  /**
   * 注册一个工具
   * @param {string} name - 工具名称
   * @param {Object} definition - 工具定义，包含 name、description、parameters 等字段
   */
  register(name, definition) {
    this.tools.set(name, definition);
  }

  /**
   * 获取所有工具的文本描述（用于提示词）
   * @returns {string} 格式化的工具描述列表
   */
  getToolsDescription() {
    return Array.from(this.tools.values()).map((t, i) => {
      const params = t.parameters.properties ? Object.keys(t.parameters.properties).join(', ') : '无';
      return `${i + 1}. **${t.name}** - ${t.description}\n   参数: ${params}`;
    }).join('\n\n');
  }

  /**
   * 获取所有工具的 JSON Schema 定义
   * @returns {Object} 以工具名为键，参数 schema 为值的对象
   */
  getToolsSchema() {
    const schemas = {};
    for (const [name, tool] of this.tools) {
      schemas[name] = tool.parameters;
    }
    return schemas;
  }

  /**
   * 解析工具调用
   * 严格解析输入内容，只识别 ```jsontool 代码块中的 JSON，并验证工具是否存在
   * @param {string|Object} input - 输入内容，可以是字符串或对象
   * @returns {Object|null} 解析后的工具调用对象，包含 toolName、params、callId，或 null
   */
  parseToolCall(input) {
    if (!input) return null;
    let parsed = null;

    if (typeof input === 'object' && input !== null) {
      parsed = input;
    } else if (typeof input === 'string') {
      const str = input.trim();
      // 严格模式：整个输入必须只包含一个 ```jsontool 代码块（允许前后空白）
      // 匹配整个字符串（^...$），其中包含代码块，且没有其他非空白字符
      // 注意：允许代码块前后有空白，但其他非空白字符会导致失败
      const codeBlockMatch = str.match(/^\s*```jsontool\s*\n?(\{[\s\S]*?\})\s*```\s*$/);
      if (codeBlockMatch) {
        // 检查是否只有代码块（即匹配后剩余字符串为空）
        // 由于使用了 ^ 和 $，已经确保整个字符串就是代码块
        try { parsed = JSON.parse(codeBlockMatch[1]); } catch (e) { return null; }
      } else {
        // 不再尝试直接解析 JSON（避免误触发），也不支持纯 JSON 对象（为了严格）
        // 只有 ```jsontool 块才会被识别
        return null;
      }
    }
    if (!parsed || !parsed.toolName) return null;
    // 验证工具是否存在（如果工具不存在，则忽略）
    if (!this.tools.has(parsed.toolName)) {
      console.warn(`[Cuckoo Code] 忽略未知工具调用: ${parsed.toolName}`);
      return null;
    }
    return {
      toolName: parsed.toolName,
      params: parsed.params || parsed.parameters || parsed.arguments || {},
      callId: parsed.callId || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  /**
   * 验证工具参数是否符合 schema 定义
   * @param {string} toolName - 工具名称
   * @param {Object} params - 待验证的参数对象
   * @returns {Object} 验证结果，包含 valid（布尔值）和 errors（错误数组）
   */
  validateParams(toolName, params) {
    const tool = this.tools.get(toolName);
    if (!tool) return { valid: false, errors: [`未知工具: ${toolName}`] };
    const schema = tool.parameters;
    if (!schema || !schema.properties) return { valid: true, errors: [] };
    const errors = [];
    const required = schema.required || [];
    for (const field of required) {
      if (params[field] === undefined || params[field] === null) {
        errors.push(`缺少必填参数: ${field}`);
      }
    }
    for (const [key, value] of Object.entries(params)) {
      const propSchema = schema.properties[key];
      if (!propSchema) continue;
      if (propSchema.type === 'string' && typeof value !== 'string') {
        errors.push(`参数 ${key} 必须是字符串`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * 执行工具调用
   * 根据 toolName 路由到对应的工具实现，通过 IPC 与主进程通信执行实际操作
   * @param {Object} toolCall - 工具调用对象
   * @param {string} toolCall.toolName - 工具名称
   * @param {Object} toolCall.params - 工具参数
   * @param {string} toolCall.callId - 调用 ID
   * @returns {Promise<Object>} 执行结果，包含 success、data 和 error 字段
   */
  async execute(toolCall) {
    const { toolName, params, callId } = toolCall;
    const validation = this.validateParams(toolName, params);
    if (!validation.valid) return { success: false, error: `参数验证失败: ${validation.errors.join(', ')}` };

    if (toolName === 'file_write') {
      // 通过 IPC 执行文件写入
      return window.electronAPI?.executeTool?.('file_write', { file_path: toolCall.params.file_path, content: toolCall.params.content, encoding: toolCall.params.encoding }, toolCall.callId)
        .then(r => ({ success: r.success, data: r.data, error: r.error }))
        .catch(e => ({ success: false, error: e.message }));
    }
    if (toolName === 'file_read') {
      // 通过 IPC 执行文件读取
      return window.electronAPI?.executeTool?.('file_read', { file_path: toolCall.params.file_path, encoding: toolCall.params.encoding }, toolCall.callId)
        .then(r => ({ success: r.success, data: r.data, error: r.error }))
        .catch(e => ({ success: false, error: e.message }));
    }
    if (toolName === 'file_edit') {
      // 通过 IPC 执行文件编辑
      return window.electronAPI?.executeTool?.('file_edit', {
        file_path: toolCall.params.file_path,
        old_string: toolCall.params.old_string,
        new_string: toolCall.params.new_string,
        replace_all: toolCall.params.replace_all
      }, toolCall.callId)
        .then(r => ({ success: r.success, data: r.data, error: r.error }))
        .catch(e => ({ success: false, error: e.message }));
    }
    if (toolName === 'file_glob') {
      // 通过 IPC 执行 glob 搜索
      return window.electronAPI?.executeTool?.('file_glob', {
        pattern: toolCall.params.pattern,
        path: toolCall.params.path
      }, toolCall.callId)
        .then(r => ({ success: r.success, data: r.data, error: r.error }))
        .catch(e => ({ success: false, error: e.message }));
    }
    if (toolName === 'file_grep') {
      // 通过 IPC 执行 grep 搜索
      return window.electronAPI?.executeTool?.('file_grep', {
        pattern: toolCall.params.pattern,
        path: toolCall.params.path,
        glob: toolCall.params.glob,
        ignore_case: toolCall.params.ignore_case,
        output_mode: toolCall.params.output_mode,
        context: toolCall.params.context
      }, toolCall.callId)
        .then(r => ({ success: r.success, data: r.data, error: r.error }))
        .catch(e => ({ success: false, error: e.message }));
    }
    if (toolName === 'bash') {
      // 通过 IPC 执行 shell 命令
      return window.electronAPI?.executeTool?.('bash', {
        command: toolCall.params.command,
        cwd: toolCall.params.cwd,
        timeout: toolCall.params.timeout
      }, toolCall.callId)
        .then(r => ({ success: r.success, data: r.data, error: r.error }))
        .catch(e => ({ success: false, error: e.message }));
    }
    return { success: false, error: `未实现的工具: ${toolName}` };
  }

  // getSystemPrompt() {
  //   const tools = Array.from(this.tools.values());
  //   let prompt = '# 可用工具\n\n';
  //   for (const tool of this.tools.values()) {
  //     prompt += `## ${tool.name}\n${tool.description}\n\n`;
  //     if (tool.parameters && tool.parameters.properties) {
  //       prompt += '**参数：**\n';
  //       for (const [key, schema] of Object.entries(tool.parameters.properties)) {
  //         const required = tool.parameters.required?.includes(key) ? ' (必填)' : ' (选填)';
  //         prompt += `- \`${key}\`${required}: ${schema.description} (类型: ${schema.type})\n`;
  //       }
  //       prompt += '\n';
  //     }
  //     prompt += '---\n\n';
  //   }
  //   prompt += '## 调用格式\n\n请将工具调用 JSON 输出在 以```jsontool为开头,以```为结尾进行 标记，仅输出 JSON，不要包含其他文字，并确保正确转义（换行\\n、引号\\"、反斜杠\\\\）：\n\n```jsontool\n{"toolName": "file_write", "params": { "file_path": "src/example.js", "content": "console.log(\"Hello\");" }, "callId": "call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '"}\n```\n';
  //   return prompt;
  // }
}

// 实例化工具管理器
const toolManager = new UnifiedToolManager();

// ========== 暴露给渲染进程的 API ==========
// 尝试 contextBridge，如果失败则直接挂载到 window（作为 fallback）
let electronAPI = {
  executeCommand: (command, id) => {
    return ipcRenderer.invoke('execute-command', { command, id });
  },
  initProject: () => {
    return ipcRenderer.invoke('init-project', { skipPrompt: false });
  },
  updateProjectDir: () => {
    return ipcRenderer.invoke('init-project', { skipPrompt: true });
  },
  executeTool: (toolName, params, callId) => {
    return ipcRenderer.invoke('execute-tool', { toolName, params, callId });
  },
  listSessions: () => {
    return ipcRenderer.invoke('list-sessions');
  },
  navigateSession: (sessionId) => {
    return ipcRenderer.invoke('navigate-session', { sessionId });
  },
};

try {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
} catch (err) {
  console.error('[Cuckoo Code] contextBridge.exposeInMainWorld 失败:', err);
}

// 无论 contextBridge 是否成功，都直接挂载到 window 作为备选
window.electronAPI = electronAPI;

// ========== 覆盖层 UI 注入 ==========

const OVERLAY_HTML = `
<div id="cuckoo-overlay" class="cuckoo-overlay cuckoo-hidden">
  <div class="cuckoo-header">
    <span class="cuckoo-title">🤖 Cuckoo Code - 命令检测</span>
    <button id="cuckoo-btn-minimize" class="cuckoo-btn-icon">—</button>
  </div>
  <div class="cuckoo-body">
    <!-- 当前项目目录展示区域 -->
    <div class="cuckoo-section cuckoo-project-dir-section">
      <div class="cuckoo-project-dir-row">
        <span class="cuckoo-label">📁 当前项目目录</span>
        <button id="cuckoo-btn-change-dir" class="cuckoo-btn-change-dir" title="点击修改项目目录">🔄 修改</button>
      </div>
      <div id="cuckoo-project-dir-display" class="cuckoo-project-dir-display">
        <span class="cuckoo-dir-path">未选择</span>
      </div>
    </div>
    <div class="cuckoo-divider"></div>
    <!-- 会话列表区域 -->
    <div class="cuckoo-section cuckoo-session-section">
      <div class="cuckoo-session-header">
        <span class="cuckoo-label">📚 会话列表</span>
        <button id="cuckoo-btn-refresh-sessions" class="cuckoo-btn-refresh-sessions" title="刷新会话列表">🔄 刷新</button>
      </div>
      <div id="cuckoo-session-list" class="cuckoo-session-list">
        <div class="cuckoo-session-empty">暂无会话</div>
      </div>
    </div>
    <div class="cuckoo-divider"></div>
    <div class="cuckoo-section">
      <label class="cuckoo-label">检测到命令：</label>
      <pre id="cuckoo-cmd-preview" class="cuckoo-cmd-preview">暂无</pre>
    </div>
    <div class="cuckoo-actions">
      <button id="cuckoo-btn-execute" class="cuckoo-btn cuckoo-btn-primary">▶ 确认执行</button>
      <button id="cuckoo-btn-ignore" class="cuckoo-btn cuckoo-btn-secondary">✕ 忽略</button>
    </div>
    <div class="cuckoo-actions">
      <button id="cuckoo-btn-init" class="cuckoo-btn cuckoo-btn-primary">🚀 初始化项目</button>
      <button id="cuckoo-btn-send-prompt" class="cuckoo-btn cuckoo-btn-secondary">📋 发送系统提示词</button>
      <button id="cuckoo-btn-manual-parse" class="cuckoo-btn cuckoo-btn-secondary" title="手动触发解析当前页面内容中的工具调用">🔍 手动解析</button>
    </div>
    <div class="cuckoo-actions">
      <button id="cuckoo-btn-gen-doc" class="cuckoo-btn cuckoo-btn-primary" title="让 AI 生成项目说明文档 (CUCKOO.md)">📄 生成项目说明</button>
    </div>
    <div id="cuckoo-result-section" class="cuckoo-section cuckoo-hidden">
      <label class="cuckoo-label">执行结果：</label>
      <div id="cuckoo-result-status" class="cuckoo-result-status"></div>
      <pre id="cuckoo-result-output" class="cuckoo-result-output"></pre>
    </div>
    <div class="cuckoo-section">
      <details id="cuckoo-history">
        <summary class="cuckoo-label">📋 历史记录</summary>
        <div id="cuckoo-history-list" class="cuckoo-history-list"></div>
        <button id="cuckoo-btn-clear" class="cuckoo-btn-text">清空历史</button>
      </details>
    </div>
  </div>
</div>
<div id="cuckoo-status-badge">
  <span id="cuckoo-status-dot"></span> Cuckoo Code 运行中
</div>
`;

const OVERLAY_CSS = `
.cuckoo-overlay {
  position: fixed; top: 0; right: 0; width: 380px; height: 100vh;
  background: rgba(26, 26, 46, 0.95); backdrop-filter: blur(12px);
  border-left: 1px solid rgba(255,255,255,0.1); z-index: 2147483647;
  display: flex; flex-direction: column;
  box-shadow: -4px 0 20px rgba(0,0,0,0.3);
  transition: transform 0.3s ease, opacity 0.3s ease;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #e0e0e0; font-size: 14px; line-height: 1.5;
}
.cuckoo-overlay.cuckoo-hidden {
  transform: translateX(100%); opacity: 0; pointer-events: none;
}
.cuckoo-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; background: rgba(0,0,0,0.3);
  border-bottom: 1px solid rgba(255,255,255,0.08); flex-shrink: 0;
}
.cuckoo-title { font-size: 14px; font-weight: 600; color: #7c83ff; letter-spacing: 0.5px; }
.cuckoo-btn-icon {
  background: none; border: none; color: #888; cursor: pointer;
  font-size: 18px; width: 28px; height: 28px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.cuckoo-btn-icon:hover { background: rgba(255,255,255,0.1); color: #fff; }
.cuckoo-body { padding: 16px 20px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 14px; }
.cuckoo-section { display: flex; flex-direction: column; gap: 8px; }
.cuckoo-label { font-size: 12px; font-weight: 600; color: #aaa; text-transform: uppercase; letter-spacing: 0.8px; cursor: pointer; }
.cuckoo-cmd-preview {
  background: rgba(0,0,0,0.4); border: 1px solid rgba(124,131,255,0.3);
  border-radius: 8px; padding: 12px 14px;
  font-family: 'Cascadia Code','Fira Code','Consolas',monospace;
  font-size: 13px; color: #7cffb2; line-height: 1.5;
  max-height: 200px; overflow: auto; white-space: pre-wrap; word-break: break-all; margin: 0;
}
.cuckoo-actions { display: flex; gap: 10px; margin-top: 4px; }
.cuckoo-btn {
  flex: 1; padding: 10px 16px; border: none; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: all 0.2s; letter-spacing: 0.5px;
}
.cuckoo-btn:active { transform: scale(0.97); }
.cuckoo-btn-primary {
  background: linear-gradient(135deg,#7c83ff,#5a63ff); color: #fff;
  box-shadow: 0 2px 8px rgba(124,131,255,0.3);
}
.cuckoo-btn-primary:hover { box-shadow: 0 4px 14px rgba(124,131,255,0.5); transform: translateY(-1px); }
.cuckoo-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.cuckoo-btn-secondary {
  background: rgba(255,255,255,0.08); color: #ccc; border: 1px solid rgba(255,255,255,0.1);
}
.cuckoo-btn-secondary:hover { background: rgba(255,255,255,0.15); color: #fff; }
#cuckoo-btn-send-prompt {
  background: rgba(124,131,255,0.2); color: #7c83ff; border: 1px solid rgba(124,131,255,0.3);
}
#cuckoo-btn-send-prompt:hover {
  background: rgba(124,131,255,0.3); color: #fff;
}
.cuckoo-btn-text {
  background: none; border: none; color: #888; padding: 4px 0;
  text-align: left; font-size: 12px; cursor: pointer;
}
.cuckoo-btn-text:hover { color: #ff6b6b; }
.cuckoo-result-status { font-size: 13px; font-weight: 600; padding: 4px 0; }
.cuckoo-result-status.success { color: #7cffb2; }
.cuckoo-result-status.error { color: #ff6b6b; }
.cuckoo-result-output {
  background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px; padding: 12px 14px;
  font-family: 'Cascadia Code','Fira Code','Consolas',monospace;
  font-size: 12px; color: #e0e0e0; line-height: 1.5;
  max-height: 250px; overflow: auto; white-space: pre-wrap; word-break: break-all; margin: 0;
}
.cuckoo-history-list { max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.cuckoo-history-item {
  background: rgba(0,0,0,0.3); border-radius: 6px; padding: 8px 10px;
  font-size: 12px; cursor: pointer; transition: background 0.2s;
}
.cuckoo-history-item:hover { background: rgba(124,131,255,0.15); }
.cuckoo-history-item .cuckoo-cmd-text {
  font-family: 'Consolas',monospace; color: #7cffb2; font-size: 12px;
  display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cuckoo-history-item .cuckoo-cmd-status { font-size: 11px; margin-top: 2px; display: block; }
.cuckoo-history-item .cuckoo-cmd-status.success { color: #7cffb2; }
.cuckoo-history-item .cuckoo-cmd-status.error { color: #ff6b6b; }
.cuckoo-history-item .cuckoo-cmd-time { font-size: 10px; color: #666; margin-top: 2px; display: block; }
#cuckoo-status-badge {
  position: fixed; bottom: 20px; left: 20px; z-index: 2147483647;
  background: rgba(124,131,255,0.15); border: 1px solid rgba(124,131,255,0.3);
  border-radius: 20px; padding: 6px 14px; font-size: 11px; color: #7c83ff;
  display: flex; align-items: center; gap: 6px; cursor: pointer;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  transition: background 0.2s, border-color 0.2s;
}
#cuckoo-status-badge:hover {
  background: rgba(124,131,255,0.3);
  border-color: rgba(124,131,255,0.6);
}
#cuckoo-status-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #7cffb2; animation: cuckoo-pulse 2s infinite;
}
@keyframes cuckoo-pulse {
  0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
}
.cuckoo-hidden { display: none !important; }
.cuckoo-overlay ::-webkit-scrollbar { width: 6px; }
.cuckoo-overlay ::-webkit-scrollbar-track { background: transparent; }
.cuckoo-overlay ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
.cuckoo-overlay ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }

/* 项目目录展示样式 */
.cuckoo-project-dir-section {
  background: rgba(0,0,0,0.2);
  border-radius: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(124,131,255,0.2);
}
.cuckoo-project-dir-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cuckoo-btn-change-dir {
  background: rgba(124,131,255,0.2);
  border: none;
  color: #7c83ff;
  padding: 2px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}
.cuckoo-btn-change-dir:hover {
  background: rgba(124,131,255,0.4);
}
.cuckoo-project-dir-display {
  margin-top: 4px;
  font-size: 13px;
  font-family: 'Consolas', monospace;
  color: #aaa;
  word-break: break-all;
}
.cuckoo-dir-path {
  color: #7cffb2;
}
.cuckoo-divider {
  border-top: 1px solid rgba(255,255,255,0.06);
  margin: 4px 0;
}

/* 会话列表样式 */
.cuckoo-session-section {
  background: rgba(0,0,0,0.2);
  border-radius: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(124,131,255,0.2);
}
.cuckoo-session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cuckoo-btn-refresh-sessions {
  background: rgba(124,131,255,0.2);
  border: none;
  color: #7c83ff;
  padding: 2px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}
.cuckoo-btn-refresh-sessions:hover {
  background: rgba(124,131,255,0.4);
}
.cuckoo-session-list {
  max-height: 120px;
  overflow-y: auto;
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cuckoo-session-item {
  background: rgba(255,255,255,0.05);
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 12px;
  font-family: 'Consolas', monospace;
  color: #ccc;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cuckoo-session-item:hover {
  background: rgba(124,131,255,0.2);
}
.cuckoo-session-item .session-id {
  color: #7c83ff;
  font-size: 11px;
}
.cuckoo-session-item .session-action {
  color: #7cffb2;
  font-size: 11px;
  font-weight: 600;
}
.cuckoo-session-empty {
  color: #666;
  font-size: 12px;
  font-style: italic;
  padding: 8px 0;
  text-align: center;
}
`;

// ========== 注入样式 ==========
/**
 * 注入覆盖层 CSS 样式到页面头部
 */
function injectCSS() {
  const style = document.createElement('style');
  style.textContent = OVERLAY_CSS;
  document.head.appendChild(style);
}

// ========== 注入覆盖层 HTML ==========
/**
 * 注入覆盖层 HTML 到页面 body
 * 创建 cuckoo-root 容器并填充 OVERLAY_HTML 内容
 */
function injectOverlay() {
  const container = document.createElement('div');
  container.id = 'cuckoo-root';
  container.innerHTML = OVERLAY_HTML;
  document.body.appendChild(container);
  document.getElementById('cuckoo-status-badge')?.remove();
}

// ========== 覆盖层逻辑 ==========

let currentCommand = null;
let isExecuting = false;
let commandIdCounter = 0;
const commandHistory = [];

/**
 * 生成唯一命令 ID
 * @returns {string} 格式为 cmd_时间戳_序号 的唯一标识
 */
function generateId() {
  return `cmd_${Date.now()}_${++commandIdCounter}`;
}

/**
 * 格式化时间戳为 HH:mm:ss 格式
 * @param {number} ts - 时间戳（毫秒）
 * @returns {string} 格式化后的时间字符串
 */
function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 截断文本到指定长度，超出部分以 ... 结尾
 * @param {string} text - 要截断的文本
 * @param {number} maxLen - 最大长度，默认 50
 * @returns {string} 截断后的文本
 */
function truncate(text, maxLen = 50) {
  if (!text || text.length <= maxLen) return text || '';
  return text.substring(0, maxLen) + '...';
}

/**
 * HTML 转义，防止 XSS 攻击
 * @param {string} text - 要转义的文本
 * @returns {string} 转义后的 HTML 字符串
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 显示覆盖层（移除 hidden 类）
 */
function showOverlay() {
  const el = document.getElementById('cuckoo-overlay');
  if (el) el.classList.remove('cuckoo-hidden');
}

/**
 * 隐藏覆盖层（添加 hidden 类）
 */
function hideOverlay() {
  const el = document.getElementById('cuckoo-overlay');
  if (el) el.classList.add('cuckoo-hidden');
}

/**
 * 显示命令预览并展开覆盖层
 * @param {Object} cmdData - 命令数据对象，包含 command、timestamp、id 等字段
 */
function displayCommand(cmdData) {
  currentCommand = cmdData;
  const preview = document.getElementById('cuckoo-cmd-preview');
  const resultSection = document.getElementById('cuckoo-result-section');
  const executeBtn = document.getElementById('cuckoo-btn-execute');
  if (preview) preview.textContent = cmdData.command;
  if (resultSection) resultSection.classList.add('cuckoo-hidden');
  if (executeBtn) {
    executeBtn.disabled = false;
    executeBtn.textContent = '▶ 确认执行';
  }
  showOverlay();
}
/**
 * 确认执行当前显示的命令
 * 通过 IPC 调用主进程执行命令，并显示执行结果
 */
async function handleExecute() {
  if (!currentCommand || isExecuting) return;

  isExecuting = true;
  const executeBtn = document.getElementById('cuckoo-btn-execute');
  if (executeBtn) {
    executeBtn.disabled = true;
    executeBtn.textContent = '⏳ 执行中...';
  }

  const cmdData = currentCommand;
  const id = cmdData.id || generateId();

  try {
    const result = await window.electronAPI.executeCommand(cmdData.command, id);

    const resultSection = document.getElementById('cuckoo-result-section');
    const resultStatus = document.getElementById('cuckoo-result-status');
    const resultOutput = document.getElementById('cuckoo-result-output');

    if (resultSection) resultSection.classList.remove('cuckoo-hidden');

    if (result.canceled) {
      if (resultStatus) { resultStatus.textContent = '⏹ 已取消'; resultStatus.className = 'cuckoo-result-status'; }
      if (resultOutput) resultOutput.textContent = '';
    } else if (result.success) {
      if (resultStatus) { resultStatus.textContent = '✅ 执行成功'; resultStatus.className = 'cuckoo-result-status success'; }
      if (resultOutput) {
        resultOutput.textContent = result.stdout || '(无输出)';
        if (result.stderr) resultOutput.textContent += '\n\n⚠️ 错误输出:\n' + result.stderr;
      }
    } else {
      if (resultStatus) { resultStatus.textContent = '❌ 执行失败'; resultStatus.className = 'cuckoo-result-status error'; }
      if (resultOutput) resultOutput.textContent = result.error || result.stderr || '未知错误';
    }

    addHistory({
      id, command: cmdData.command, success: result.success,
      canceled: result.canceled, output: result.stdout || result.stderr || result.error || '',
      timestamp: cmdData.timestamp || Date.now(),
    });
  } catch (err) {
    const resultSection = document.getElementById('cuckoo-result-section');
    const resultStatus = document.getElementById('cuckoo-result-status');
    const resultOutput = document.getElementById('cuckoo-result-output');
    if (resultSection) resultSection.classList.remove('cuckoo-hidden');
    if (resultStatus) { resultStatus.textContent = '❌ 系统错误'; resultStatus.className = 'cuckoo-result-status error'; }
    if (resultOutput) resultOutput.textContent = err.message || String(err);
  } finally {
    isExecuting = false;
    if (executeBtn) {
      executeBtn.disabled = false;
      executeBtn.textContent = '▶ 确认执行';
    }
    currentCommand = null;
  }
}

/**
 * 忽略当前命令，将命令记录为已忽略并隐藏覆盖层
 */
function handleIgnore() {
  if (currentCommand) {
    addHistory({
      id: currentCommand.id || generateId(),
      command: currentCommand.command,
      success: false, canceled: true,
      output: '(已忽略)',
      timestamp: currentCommand.timestamp || Date.now(),
    });
  }
  currentCommand = null;
  hideOverlay();
}

/**
 * 发送系统提示词按钮点击处理
 */
function handleSendPrompt() {
  if (!systemPromptContent) {
    alert('系统提示词内容为空');
    return;
  }
  const input = findInputArea();
  if (!input) {
    alert('未找到输入框，请确保已打开聊天界面');
    return;
  }
  sendSystemPromptToInput(); // fills input
  // small delay then trigger send
  setTimeout(() => {
    triggerSend(input);
  }, 300);
}

/**
 * 生成项目说明文档按钮点击处理
 */
function handleGenerateDoc() {
  const input = findInputArea();
  if (!input) {
    alert('未找到输入框，请确保已打开聊天界面');
    return;
  }

  const message = '根据当前项目生成一个类似 claude.md 的项目说明文件，并将文件放到当前项目 .cuckooCode/CUCKOO.md';

  // 填入输入框并发送
  try {
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.focus();
      input.value = message;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
      input.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, message);
    }

    // 触发发送
    setTimeout(() => {
      triggerSend(input);
    }, 300);
  } catch (err) {
    console.error('[Cuckoo Code] 发送生成文档消息失败:', err.message);
    alert('发送消息失败: ' + err.message);
  }
}

/**
 * 添加一条历史记录
 * @param {Object} entry - 历史记录对象，包含 id、command、success、canceled、output、timestamp 等字段
 */
function addHistory(entry) {
  commandHistory.unshift(entry);
  if (commandHistory.length > 50) commandHistory.pop();
  renderHistory();
}

/**
 * 渲染历史记录列表
 * 将 commandHistory 中的记录渲染到界面，并为每条记录绑定点击事件以查看详情
 */
function renderHistory() {
  const list = document.getElementById('cuckoo-history-list');
  if (!list) return;

  if (commandHistory.length === 0) {
    list.innerHTML = '<div style="color:#666;font-size:12px;font-style:italic;padding:8px 0;">暂无记录</div>';
    return;
  }

  const items = commandHistory.slice(0, 20);
  list.innerHTML = items.map((item) => `
    <div class="cuckoo-history-item" data-id="${escapeHtml(item.id)}">
      <span class="cuckoo-cmd-text">${escapeHtml(truncate(item.command, 60))}</span>
      <span class="cuckoo-cmd-status ${item.canceled ? '' : item.success ? 'success' : 'error'}">
        ${item.canceled ? '⏹ 已忽略' : item.success ? '✅ 成功' : '❌ 失败'}
      </span>
      <span class="cuckoo-cmd-time">${formatTime(item.timestamp)}</span>
    </div>
  `).join('');

  list.querySelectorAll('.cuckoo-history-item').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const entry = commandHistory.find((h) => h.id === id);
      if (entry) {
        const preview = document.getElementById('cuckoo-cmd-preview');
        const resultSection = document.getElementById('cuckoo-result-section');
        const resultStatus = document.getElementById('cuckoo-result-status');
        const resultOutput = document.getElementById('cuckoo-result-output');
        if (preview) preview.textContent = entry.command;
        if (entry.output && resultSection) {
          resultSection.classList.remove('cuckoo-hidden');
          if (resultStatus) {
            resultStatus.textContent = entry.canceled ? '⏹ 已忽略' : entry.success ? '✅ 执行成功' : '❌ 执行失败';
            resultStatus.className = `cuckoo-result-status ${entry.success ? 'success' : 'error'}`;
          }
          if (resultOutput) resultOutput.textContent = entry.output || '(无输出)';
        }
        showOverlay();
      }
    });
  });
}

/**
 * 绑定覆盖层所有 UI 事件
 * 包括按钮点击、键盘快捷键、状态徽章点击等
 */
function bindEvents() {
  const minimizeBtn = document.getElementById('cuckoo-btn-minimize');
  const executeBtn = document.getElementById('cuckoo-btn-execute');
  const ignoreBtn = document.getElementById('cuckoo-btn-ignore');
  const initBtn = document.getElementById('cuckoo-btn-init');
  const sendPromptBtn = document.getElementById('cuckoo-btn-send-prompt');
  const clearBtn = document.getElementById('cuckoo-btn-clear');

  minimizeBtn?.addEventListener('click', hideOverlay);
  executeBtn?.addEventListener('click', handleExecute);
  ignoreBtn?.addEventListener('click', handleIgnore);
  initBtn?.addEventListener('click', handleInitProject);
  sendPromptBtn?.addEventListener('click', handleSendPrompt);
  clearBtn?.addEventListener('click', () => {
    commandHistory.length = 0;
    renderHistory();
  });

  // 手动解析按钮
  const manualParseBtn = document.getElementById('cuckoo-btn-manual-parse');
  manualParseBtn?.addEventListener('click', handleManualParse);

  // 生成项目说明文档按钮
  const genDocBtn = document.getElementById('cuckoo-btn-gen-doc');
  genDocBtn?.addEventListener('click', handleGenerateDoc);

  // 刷新会话列表按钮
  const refreshSessionsBtn = document.getElementById('cuckoo-btn-refresh-sessions');
  refreshSessionsBtn?.addEventListener('click', renderSessions);

  // 状态徽章点击显示覆盖层
  const statusBadge = document.getElementById('cuckoo-status-badge');
  statusBadge?.addEventListener('click', () => {
    const overlay = document.getElementById('cuckoo-overlay');
    if (overlay && overlay.classList.contains('cuckoo-hidden')) {
      showOverlay();
    }
  });

  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+C 切换覆盖层显示
    if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      const overlay = document.getElementById('cuckoo-overlay');
      if (overlay) {
        if (overlay.classList.contains('cuckoo-hidden')) {
          showOverlay();
        } else {
          hideOverlay();
        }
      }
    }
    // Esc 隐藏覆盖层
    if (e.key === 'Escape') {
      hideOverlay();
    }
  });
}

// ========== 会话列表功能 ==========

/**
 * 渲染当前项目目录关联的会话列表
 */
async function renderSessions() {
  const listContainer = document.getElementById('cuckoo-session-list');
  if (!listContainer) return;

  try {
    if (!window.electronAPI || !window.electronAPI.listSessions) {
      listContainer.innerHTML = '<div class="cuckoo-session-empty">API 不可用</div>';
      return;
    }

    const result = await window.electronAPI.listSessions();
    if (!result.success) {
      listContainer.innerHTML = '<div class="cuckoo-session-empty">加载失败</div>';
      return;
    }

    const sessions = result.sessions || [];
    if (sessions.length === 0) {
      listContainer.innerHTML = '<div class="cuckoo-session-empty">暂无会话</div>';
      return;
    }

    listContainer.innerHTML = sessions.map((sessionId) => `
      <div class="cuckoo-session-item" data-session-id="${escapeHtml(sessionId)}">
        <span class="session-id">${escapeHtml(sessionId)}</span>
        <span class="session-action">▶ 跳转</span>
      </div>
    `).join('');

    // 绑定点击事件
    listContainer.querySelectorAll('.cuckoo-session-item').forEach((item) => {
      item.addEventListener('click', () => {
        const sessionId = item.dataset.sessionId;
        if (sessionId) handleNavigateSession(sessionId);
      });
    });
  } catch (err) {
    console.error('[Cuckoo Code] 渲染会话列表失败:', err);
    listContainer.innerHTML = '<div class="cuckoo-session-empty">加载出错</div>';
  }
}

/**
 * 导航到指定会话
 */
async function handleNavigateSession(sessionId) {
  if (!sessionId) return;

  try {
    if (!window.electronAPI || !window.electronAPI.navigateSession) {
      alert('导航 API 不可用');
      return;
    }

    const result = await window.electronAPI.navigateSession(sessionId);
    if (result.success) {
      console.log('[Cuckoo Code] 已导航到会话:', sessionId);
      // 导航成功后，覆盖层可以保持打开，但用户可能会看到页面跳转
      // 小延迟后刷新会话列表
      setTimeout(renderSessions, 2000);
    } else {
      alert('导航失败: ' + (result.error || '未知错误'));
    }
  } catch (err) {
    console.error('[Cuckoo Code] 导航到会话失败:', err);
    alert('导航失败: ' + err.message);
  }
}

/**
 * 初始化项目按钮点击处理
 */
async function handleInitProject() {
  const initBtn = document.getElementById('cuckoo-btn-init');
  if (initBtn) {
    initBtn.disabled = true;
    initBtn.textContent = '⏳ 初始化中...';
  }

  try {
    // 调用主进程的 init-project IPC
    if (!window.electronAPI || !window.electronAPI.initProject) {
      throw new Error('window.electronAPI.initProject 不存在');
    }
    const result = await window.electronAPI.initProject();
    if (result && !result.success) {
      alert(result.message || '初始化失败');
    }
  } catch (err) {
    console.error('[Cuckoo Code] 初始化项目失败:', err);
    alert('初始化失败: ' + err.message);
  } finally {
    if (initBtn) {
      initBtn.disabled = false;
      initBtn.textContent = '🚀 初始化项目';
    }
  }
}

/**
 * 手动解析按钮点击处理
 * 用户点击后，扫描当前页面内容中的工具调用并执行
 */
async function handleManualParse() {
  const btn = document.getElementById('cuckoo-btn-manual-parse');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '🔍 解析中...';
  }

  try {

    // 获取页面所有文本内容
    const pageText = document.body.innerText || document.body.textContent || '';
    console.log(pageText);

    if (!pageText || pageText.trim().length === 0) {
      alert('页面内容为空，无法解析');
      return;
    }

    // 尝试解析工具调用
    const toolCalls = [];

    // 1. 尝试直接解析整个页面内容
    const directParse = tryParseToolCall(document.body.innerText || document.body.textContent || '');
    if (directParse) {
      toolCalls.push(directParse);
    }

    // 2. 如果没有解析到，尝试查找代码块
    if (toolCalls.length === 0) {
      const codeBlocks = document.querySelectorAll('pre code, pre');
      for (let i = 0; i < codeBlocks.length; i++) {
        const block = codeBlocks[i];
        const text = block.textContent || block.innerText || '';
        if (text && (text.includes('toolName') || text.includes('tool') || text.includes('file_write'))) {
          const parsed = tryParseToolCall(text);
          if (parsed) {
            toolCalls.push(parsed);
          }
        }
      }
    }

    if (toolCalls.length === 0) {
      alert('未在页面中检测到有效的工具调用 JSON');
      return;
    }


    // 执行所有检测到的工具调用
    for (const toolCall of toolCalls) {
      await handleToolCall(toolCall);
    }

    alert(`手动解析完成，共执行 ${toolCalls.length} 个工具调用`);
  } catch (err) {
    console.error('[Cuckoo Code] 手动解析出错:', err);
    alert('手动解析出错: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔍 手动解析';
    }
  }
}

// ========== DOM 监测：检测 ```cmd 代码块 ==========

/**
 * 从代码块元素中检测并提取 cmd/powershell/batch 命令
 * 支持多种语言标记方式：data-language 属性、language-* class、第一行标记
 * @param {Element} element - 要检测的 DOM 元素
 * @returns {string|null} 提取的命令内容，如果未检测到则返回 null
 */
function detectCmdInCodeBlock(element) {
  const codeEl = element.tagName === 'CODE' ? element : element.querySelector('code');
  if (!codeEl) return null;

  let language = '';

  // 方式 1: 查找 data-language 属性
  const pre = codeEl.closest('pre');
  if (pre) {
    language = pre.getAttribute('data-language') || '';
    // 也检查父级 div 上的 data-language（DeepSeek 可能的结构）
    if (!language) {
      const parentDiv = pre.closest('div[data-language]');
      if (parentDiv) language = parentDiv.getAttribute('data-language') || '';
    }
  }

  // 方式 2: class 名称（如 "language-cmd"）
  if (!language) {
    const allElements = [codeEl, pre, codeEl.parentElement].filter(Boolean);
    for (const el of allElements) {
      const cls = Array.from(el.classList).find((c) => c.startsWith('language-'));
      if (cls) { language = cls.replace('language-', ''); break; }
    }
  }

  // 方式 3: 代码第一行标记
  const text = codeEl.textContent || '';
  const firstLine = text.split('\n')[0].trim();
  if (!language) {
    const langMatch = firstLine.match(/^(```|;;|#|<!--)\s*(cmd|powershell|pwsh|batch|bat|dos)\s*/i);
    if (langMatch) language = langMatch[2].toLowerCase();
  }

  // 判断是否为支持的脚本语言
  const validLangs = ['cmd', 'powershell', 'pwsh', 'batch', 'bat', 'dos'];
  if (!language || !validLangs.includes(language.toLowerCase())) return null;

  // 提取命令内容
  const lines = text.split('\n');
  if (lines[0].match(/^(```|;;|#|<!--)\s*(cmd|powershell|pwsh|batch|bat|dos)/i)) {
    lines.shift();
  }
  if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
    lines.pop();
  }

  return lines.join('\n').trim() || null;
}

/**
 * 用于记录已检测过的节点，避免重复处理
 */
const detectedSet = new WeakSet();

/**
 * 扫描给定的 DOM 节点列表，提取其中的命令
 * @param {NodeList|Array} nodes - 要扫描的 DOM 节点列表
 * @returns {string[]} 提取到的命令数组
 */
function scanForCommands(nodes) {
  const commands = [];
  for (const node of nodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    // 检查节点本身
    if (['PRE', 'CODE', 'DIV'].includes(node.tagName)) {
      if (!detectedSet.has(node)) {
        detectedSet.add(node);
        const cmd = detectCmdInCodeBlock(node);
        if (cmd) commands.push(cmd);
      }
    }

    // 检查子节点
    const codeBlocks = node.querySelectorAll('pre, code');
    for (const block of codeBlocks) {
      if (!detectedSet.has(block)) {
        detectedSet.add(block);
        const cmd = detectCmdInCodeBlock(block);
        if (cmd) commands.push(cmd);
      }
    }
  }
  return commands;
}

/**
 * 扫描工具调用
 * 专门用于检测 AI 回复中的工具调用
 */
function scanForToolCalls(nodes) {
  const toolCalls = [];
  for (const node of nodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    // 跳过用户消息区域：用户消息中包含系统提示词的示例 JSON，不应被当作工具调用
    if (isInsideUserMessage(node)) {
      continue;
    }

    // 检查 pre/code 代码块
    if (['PRE', 'CODE'].includes(node.tagName)) {
      if (!detectedSet.has(node)) {
        detectedSet.add(node);
        const text = (node.textContent || node.innerText || '').trim();
        console.log(text);
        if (text.includes('toolName') || text.includes('"tool"') || text.includes('file_write')) {
          const toolCall = tryParseToolCall(text);
          if (toolCall) toolCalls.push(toolCall);
        }
      }
    }

    // 检查子节点中的 pre/code
    const codeBlocks = node.querySelectorAll('pre, code');
    for (const block of codeBlocks) {
      if (!detectedSet.has(block)) {
        detectedSet.add(block);
        const text = (block.textContent || block.innerText || '').trim();
        console.log(text);
        if (text.includes('toolName') || text.includes('"tool"') || text.includes('file_write')) {
          const toolCall = tryParseToolCall(text);
          if (toolCall) toolCalls.push(toolCall);
        }
      }
    }

    // 检查 markdown 渲染后的内容（仅限 AI 回复区域）
    if (node.tagName === 'DIV') {
      const text = (node.textContent || node.innerText || '').trim();
      if (text.includes('toolName') || text.includes('"tool"') || text.includes('file_write')) {
        console.log(text);
        const toolCall = tryParseToolCall(text);
        if (toolCall) toolCalls.push(toolCall);
      }
    }
  }
  return toolCalls;
}

/**
 * 检查节点是否在用户消息区域内
 * 用户消息中包含系统提示词示例 JSON，应被排除
 */
function isInsideUserMessage(node) {
  // 方法1: 检查节点或其祖先是否为用户消息元素
  let current = node;
  while (current) {
    const role = current.getAttribute?.('data-role') || current.getAttribute?.('data-author') || '';
    if (role === 'user' || role === 'human') return true;

    // 检查常见的用户消息 class
    const cls = current.className || '';
    if (typeof cls === 'string' && (cls.includes('user-message') || cls.includes('message-user') || cls.includes('human'))) {
      return true;
    }

    current = current.parentElement;
  }

  // 方法2: 检查文本内容是否包含用户消息的显著特征
  const text = (node.textContent || node.innerText || '').substring(0, 200);
  if (text.includes('我已选择目录：') || text.includes('系统提示词：') || text.includes('工具使用规则：')) {
    return true;
  }

  return false;
}

// ========== AI 回复完成检测 ==========
/**
 * 检测 AI 是否已完成回复
 * 规则：如果能找到停止生成按钮（disabled 状态），则视为回复结束
 * @returns {boolean} true 表示 AI 已完成回复
 */
const STOP_BTN_SELECTOR =
  '.ds-button.ds-button--primary.ds-button--filled.ds-button--circle.ds-button--m' +
  '.ds-button--icon-relative-m.ds-button--disabled';

function isAIResponseComplete() {
  try {
    // 如果能在 DOM 中找到 disabled 的停止按钮，则视为回复结束
    const stopBtn = document.querySelector(STOP_BTN_SELECTOR);
    if (stopBtn) {
      console.log('[Cuckoo Code] ✅ 检测到停止按钮(disabled)，回复已结束');
      return true;
    }

    // 找不到停止按钮，说明可能还在生成中，或页面状态不确定
    console.log('[Cuckoo Code] ⏳ 未找到停止按钮，回复可能未结束');
    return false;
  } catch (err) {
    console.error('[Cuckoo Code] ❌ 检测 AI 完成状态出错:', err);
    // 出错时保守返回 true，避免永远不处理
    return true;
  }
}

// ========== MutationObserver ==========

// 已处理过的消息节点集合（避免重复处理）
const processedMessages = new WeakSet();

// 内容不完整时的最大重试次数（AI 生成长内容可能需 30 秒+）
const MAX_RETRY_COUNT = 20;
// 重试间隔（ms）
const RETRY_INTERVAL = 2000;

/**
 * 生成 2-4 秒的随机等待时间（ms）
 */
function randomDelay() {
  return Math.floor(Math.random() * 2000) + 2000; // 2000-3999ms
}

/**
 * 检查字符串是否为"疑似工具调用但内容不完整"
 * 规则：文本包含 { 且含工具调用特征（toolName/工具名/大括号开头），
 * 则从第一个 { 开始检查括号配对；配对不完整返回 false（需要重试）
 */
function isJsonBalanced(str) {
  const trimmed = (str || '').trim();
  // 不含 { 或没有工具调用特征 → 不是工具调用，直接通过
  if (!trimmed.includes('{')) return true;
  if (!/toolName|"tool"|file_|json复制|```/.test(trimmed) && !trimmed.trimStart().startsWith('{')) {
    return true;
  }
  // 从第一个 { 开始检查括号配对
  const jsonPart = trimmed.substring(trimmed.indexOf('{'));
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  for (const char of jsonPart) {
    if (escapeNext) { escapeNext = false; continue; }
    if (char === '\\') { escapeNext = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') braceCount++;
      else if (char === '}') {
        braceCount--;
        if (braceCount < 0) return true; // 多出的 }，视为异常但不再等
      }
    }
  }
  return braceCount === 0;
}

/**
 * 回复结束后，获取最新 .ds-message > .ds-markdown 的内容并解析工具调用
 * @param {number} retryCount 当前重试次数（内容不完整时延迟重试）
 */
function processLatestAIResponse(retryCount = 0) {
  const messages = document.querySelectorAll('.ds-message');
  if (messages.length === 0) {
    console.log('[Cuckoo Code] 未找到 .ds-message 节点');
    return;
  }

  // 取最后一条消息
  const lastMessage = messages[messages.length - 1];
  const markdown = lastMessage.querySelector(':scope > .ds-markdown');
  if (!markdown) {
    console.log('[Cuckoo Code] 最新消息中没有 .ds-markdown');
    return;
  }

  if (processedMessages.has(lastMessage)) {
    return; // 已处理过，跳过
  }

  // 提取文本：优先从 pre code 提取（代码块内容天然不含 json/复制/下载等按钮文字）
  let text = '';
  const codeEl = markdown.querySelector('pre code');
  if (codeEl) {
    text = (codeEl.textContent || codeEl.innerText || '').trim();
    console.log('[Cuckoo Code] 提取方式: pre code 元素');
  } else {
    // 无代码块：克隆节点并剔除可能的工具栏元素
    const clone = markdown.cloneNode(true);
    clone.querySelectorAll('button, [class*="toolbar"], [class*="copy"], [class*="download"], [class*="code-block-header"], [class*="lang"], [class*="header"]').forEach(el => el.remove());
    text = (clone.textContent || clone.innerText || '').trim();
    console.log('[Cuckoo Code] 提取方式: 克隆节点(剔除工具栏)');
  }

  // 完整打印：长度 + 原文 + 转义形式（JSON.stringify 显示 \n 而非真实换行，方便确认完整性）
  console.log('[Cuckoo Code] 回复文本长度: ' + text.length);
  console.log('[Cuckoo Code] 回复完整内容(原文):');
  console.log(text);
  console.log('[Cuckoo Code] 回复完整内容(转义显示):');
  console.log(JSON.stringify(text));

  if (!text) return;

  // 内容不完整（疑似流式输出未真正结束）：延迟重试，避免处理截断的 JSON
  if (!isJsonBalanced(text)) {
    if (retryCount < MAX_RETRY_COUNT) {
      console.log('[Cuckoo Code] ⏳ JSON 不完整(疑似流式未结束)，' + (retryCount + 1) + '/' + MAX_RETRY_COUNT + ' 次延迟重试, 当前长度=' + text.length + '...');
      setTimeout(() => processLatestAIResponse(retryCount + 1), RETRY_INTERVAL);
      return; // 不标记 processed，允许重试
    }
    console.log('[Cuckoo Code] ⚠️ JSON 持续不完整（20次重试仍截断），放弃本次处理，当前长度=' + text.length);
    // 回传 AI，让它重新完整输出
    sendToolResultToChat(
      { toolName: '未知', callId: 'incomplete' },
      { success: false, error: '收到不完整的工具调用 JSON（内容被截断），请重新完整输出工具调用。' }
    );
  }

  processedMessages.add(lastMessage);

  const toolCall = tryParseToolCall(text);
  if (toolCall) {
    // 验证 toolName 是否在工具库中
    const available = toolManager.tools.has(toolCall.toolName);
    if (!available) {
      console.log('[Cuckoo Code] ⚠️ 工具不存在: ' + toolCall.toolName + ', 可用工具: ' + Array.from(toolManager.tools.keys()).join(', '));
      // 回传 AI，告知工具不存在
      sendToolResultToChat(
        toolCall,
        { success: false, error: '工具 ' + toolCall.toolName + ' 不存在，可用工具: ' + Array.from(toolManager.tools.keys()).join(', ') }
      );
      return;
    }
    console.log('[Cuckoo Code] ✅ 工具存在: ' + toolCall.toolName + ', 开始执行');
    notifyToolCallDetected(toolCall);
    handleToolCall(toolCall);
  } else {
    console.log('[Cuckoo Code] 回复内容不是工具调用 JSON');
    // 内容疑似工具调用但解析失败 → 回传 AI 提示格式问题，让它修正后重新输出
    // if (text.includes('tool') || text.includes('file_')) {
    //   sendToolResultToChat(
    //     { toolName: '未知', callId: 'parse_failed' },
    //     { success: false, error: '工具调用 JSON 解析失败，请检查 JSON 格式与转义（换行用\\n、双引号用\\"、反斜杠用\\\\），重新输出完整且合法的工具调用。' }
    //   );
    // }
  }
}

// 读取防抖定时器
let responseReadTimer = null;

function startObserver() {
  const observer = new MutationObserver((mutations) => {
    let hasNewContent = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // 扫描命令
        const commands = scanForCommands(mutation.addedNodes);
        for (const cmd of commands) {
          displayCommand({ command: cmd, timestamp: Date.now(), id: generateId() });
        }
        hasNewContent = true;
      }
    }

    // 回复结束后处理最新 AI 回复（带 2-4s 随机防抖延迟，确保流式渲染完成）
    if (hasNewContent && isAIResponseComplete()) {
      clearTimeout(responseReadTimer);
      const delay = randomDelay();
      console.log('[Cuckoo Code] ⏳ 检测到回复结束，随机等待 ' + delay + 'ms 后读取回复...');
      responseReadTimer = setTimeout(() => {
        console.log('[Cuckoo Code] ✅ 等待结束，开始读取回复');
        processLatestAIResponse();
      }, delay);
    }
  });

  const target = document.body || document.documentElement;
  if (target) {
    observer.observe(target, { childList: true, subtree: true });
  }
}

/**
 * 通知用户检测到工具调用（闪烁状态徽章 + 展开覆盖层）
 */
function notifyToolCallDetected(toolCall) {
  showOverlay();
  // 更新预览区域显示检测到的工具调用
  const preview = document.getElementById('cuckoo-cmd-preview');
  if (preview) {
    preview.textContent = `[工具] ${toolCall.toolName}\n参数: ${JSON.stringify(toolCall.params, null, 2)}`;
  }
  // 闪烁状态徽章
  const badge = document.getElementById('cuckoo-status-badge');
  const dot = document.getElementById('cuckoo-status-dot');
  if (badge) {
    badge.style.background = 'rgba(124,255,178,0.25)';
    badge.style.borderColor = 'rgba(124,255,178,0.6)';
    badge.querySelector('span:last-child') && (badge.querySelector('span:last-child').textContent = 'Cuckoo Code - 工具调用检测到');
    setTimeout(() => {
      badge.style.background = 'rgba(124,131,255,0.15)';
      badge.style.borderColor = 'rgba(124,131,255,0.3)';
      badge.querySelector('span:last-child') && (badge.querySelector('span:last-child').textContent = 'Cuckoo Code 运行中');
    }, 3000);
  }
  if (dot) {
    dot.style.background = '#ffc107';
    dot.style.animation = 'none';
    setTimeout(() => {
      dot.style.background = '#7cffb2';
      dot.style.animation = 'cuckoo-pulse 2s infinite';
    }, 3000);
  }
}

// ========== 系统提示词 ==========

let systemPromptContent = '';
let initialPromptContent = '';
let pendingSystemPrompt = false; // 是否有待发送的 system prompt
let pendingInitialPrompt = false; // 是否有待发送的初始提示（目录树+systemPrompt）
let pendingToolCall = null; // 待执行的工具调用

// ========== 工具调用解析与执行 ==========

/**
 * 尝试解析工具调用
 * 支持格式：
 * 1. 标准格式: {"toolName": "...", "params": {...}, "callId": "..."}
 * 2. 代码块格式: ```json {...} ``` 或 ```tool {...} ```
 * 3. 包含额外文本的混合内容
 */
/**
 * 宽容解析 JSON：先严格解析，失败后修复常见格式问题再解析
 * 常见问题：字符串值内未转义的换行、tab、引号（AI 生成的 JSON 经常忘记转义）
 */
/**
 * 宽容解析 JSON：先严格解析，失败后修复常见格式问题再解析
 * 常见问题：字符串值内未转义的换行、tab、引号（AI 生成的 JSON 经常忘记转义）
 * @param {string} str - 待解析的 JSON 字符串
 * @returns {Object|null} 解析后的对象，解析失败返回 null
 */
function parseJsonWithRepair(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch (e) {
    // 修复：把字符串值内裸的换行/tab 转义为 \n \t
    const repaired = repairJsonString(str);
    try {
      return JSON.parse(repaired);
    } catch (e2) {
      return null;
    }
  }
}

/**
 * 修复 JSON 字符串：逐字符扫描，把字符串值内的裸换行、\r、\t 转义，
 * 并把明显是内容而非边界的裸引号转义为 \"
 */
function repairJsonString(str) {
  let result = '';
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (escapeNext) {
      result += ch;
      escapeNext = false;
      continue;
    }

    if (ch === '\\') {
      result += ch;
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      if (inString) {
        // 字符串内遇到的引号：判断是边界还是内容
        const nextChar = str[i + 1];
        const prevChar = result[result.length - 1] || '';
        const isBoundary = nextChar === ':' || nextChar === ',' || nextChar === '}' || nextChar === ']' ||
          nextChar === undefined || /[\s]/.test(nextChar || '') ||
          prevChar === ':' || prevChar === ',' || prevChar === '{' || prevChar === '[';
        if (isBoundary) {
          // 字符串结束边界
          inString = false;
          result += '"';
        } else {
          // 内容里的引号，转义
          result += '\\"';
        }
      } else {
        inString = true;
        result += '"';
      }
      continue;
    }

    if (inString) {
      // 字符串值内的裸控制字符 → 转义
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { result += '\\r'; continue; }
      if (ch === '\t') { result += '\\t'; continue; }
    }

    result += ch;
  }

  return result;
}

function tryParseToolCall(content) {
  if (!content || typeof content !== 'string') return null;
  const str = content.trim();

  let parsed = null;

  // 1. 尝试直接解析 JSON（纯 JSON 响应，含容错修复）
  parsed = parseJsonWithRepair(str);

  // 2. 提取代码块 ```json/tool ... ```
  if (!parsed) {
    const codeBlockMatch = str.match(/```(?:json|tool)?\s*\n?(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      const extracted = codeBlockMatch[1].trim();
      parsed = parseJsonWithRepair(extracted);
    }
  }

  // 3. 在文本中查找 JSON 对象（取第一个完整的 { ... }）
  if (!parsed) {
    const firstBrace = str.indexOf('{');
    if (firstBrace !== -1) {
      const candidate = extractJsonObject(str, firstBrace);
      if (candidate) {
        parsed = parseJsonWithRepair(candidate);
      }
    }
  }

  if (!parsed) {
    return null;
  }

  // 支持多种字段名：toolName/tool, params/parameters/arguments
  if (!parsed.toolName && !parsed.tool) {
    console.log('[Cuckoo Code] 缺少 toolName/tool 字段, 完整对象:', JSON.stringify(parsed));
    return null;
  }

  // 标准化输出
  const result = {
    toolName: parsed.toolName || parsed.tool,
    params: parsed.params || parsed.parameters || parsed.arguments || {},
    callId: parsed.callId || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  };
  console.log('[Cuckoo Code] ✅ 解析成功, toolName=' + result.toolName + ', params=' + JSON.stringify(result.params));
  return result;
}


/**
 * 从文本中提取完整的 JSON 对象字符串（从 startPos 的 { 开始）
 * 通过括号配对找到对应的 } 结束位置
 */
function extractJsonObject(str, startPos) {
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startPos; i < str.length; i++) {
    const char = str[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') braceCount++;
      else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return str.substring(startPos, i + 1);
        }
      }
    }
  }

  // 括号未配对完成（流式输出未结束）
  return null;
}

/**
 * 执行工具调用
 */
async function handleToolCall(toolCall) {
  const { toolName, params, callId } = toolCall;
  console.log(`[Cuckoo Code] 执行工具: ${toolName}`, params);

  // 确保覆盖层可见，让用户看到正在处理
  showOverlay();
  const executeBtn = document.getElementById('cuckoo-btn-execute');
  if (executeBtn) {
    executeBtn.disabled = true;
    executeBtn.textContent = '⏳ 工具执行中...';
  }

  try {
    const result = await window.electronAPI.executeTool(toolName, params, callId);

    // 显示执行结果
    const resultSection = document.getElementById('cuckoo-result-section');
    const resultStatus = document.getElementById('cuckoo-result-status');
    const resultOutput = document.getElementById('cuckoo-result-output');

    if (resultSection) resultSection.classList.remove('cuckoo-hidden');

    if (result.success) {
      if (resultStatus) {
        resultStatus.textContent = `✅ 工具 ${toolName} 执行成功`;
        resultStatus.className = 'cuckoo-result-status success';
      }
      if (resultOutput) {
        resultOutput.textContent = JSON.stringify(result.data, null, 2);
      }
    } else {
      if (resultStatus) {
        resultStatus.textContent = `❌ 工具 ${toolName} 执行失败`;
        resultStatus.className = 'cuckoo-result-status error';
      }
      if (resultOutput) {
        resultOutput.textContent = result.error || '未知错误';
      }
    }

    // 添加到历史
    addHistory({
      id: callId,
      command: `[工具] ${toolName}`,
      success: result.success,
      output: result.success ? JSON.stringify(result.data, null, 2) : (result.error || '未知错误'),
      timestamp: Date.now(),
    });

    // 将执行结果发送回聊天，让 AI 看到结果并继续工作
    sendToolResultToChat(toolCall, result);
  } catch (err) {
    console.error('[Cuckoo Code] 工具执行异常:', err);
    const resultSection = document.getElementById('cuckoo-result-section');
    const resultStatus = document.getElementById('cuckoo-result-status');
    const resultOutput = document.getElementById('cuckoo-result-output');
    if (resultSection) resultSection.classList.remove('cuckoo-hidden');
    if (resultStatus) {
      resultStatus.textContent = '❌ 系统错误';
      resultStatus.className = 'cuckoo-result-status error';
    }
    if (resultOutput) resultOutput.textContent = err.message || String(err);
    // 系统异常也要回传 AI，让它知道发生了什么
    sendToolResultToChat(toolCall, { success: false, error: '系统异常: ' + (err.message || String(err)) });
  } finally {
    if (executeBtn) {
      executeBtn.disabled = false;
      executeBtn.textContent = '▶ 确认执行';
    }
  }
}

/**
 * 将工具执行结果发送回 DeepSeek 聊天，让 AI 看到结果并继续工作
 */
function sendToolResultToChat(toolCall, result) {
  const input = findInputArea();
  if (!input) {
    console.log('[Cuckoo Code] ❌ 找不到输入框，无法回传工具结果');
    return;
  }

  // 构造回传消息（明确的成功/失败信息，AI 可据此修正并继续）
  let msg;
  if (result.success) {
    const data = result.data || {};
    // 大内容截断保护（20KB），避免超长消息
    if (typeof data.content === 'string' && data.content.length > 20000) {
      data.content = data.content.substring(0, 20000) + '\n...[内容过长已截断]...';
    }
    msg = '【工具执行结果】' + toolCall.toolName + ' 执行成功 (callId: ' + (toolCall.callId || '') + ')\n' +
      JSON.stringify(data, null, 2);
  } else {
    msg = '【工具执行结果】' + toolCall.toolName + ' 执行失败 (callId: ' + (toolCall.callId || '') + ')\n' +
      '错误原因: ' + (result.error || '未知错误') + '\n' +
      '请根据错误原因修正参数后重新调用工具。';
  }

  console.log('[Cuckoo Code] 回传工具结果, 输入框类型=' + input.tagName + ', 消息长度=' + msg.length);

  // 填入输入框（React 兼容：使用原生 value setter，否则 React 状态不更新）
  try {
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(
        input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        'value'
      ).set;
      nativeSetter.call(input, msg);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('[Cuckoo Code] ✅ 已填入 textarea, 当前值长度=' + (input.value || '').length);
    } else if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
      input.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, msg);
      console.log('[Cuckoo Code] ✅ 已填入 contenteditable');
    }
  } catch (err) {
    console.error('[Cuckoo Code] ❌ 回传工具结果到输入框失败:', err.message);
    return;
  }

  // 触发发送（2-4s 随机等待，模拟人工输入节奏）
  const sendDelay = randomDelay();
  console.log('[Cuckoo Code] ⏳ 消息已填入输入框，随机等待 ' + sendDelay + 'ms 后发送...');
  setTimeout(() => {
    console.log('[Cuckoo Code] ✅ 等待结束，开始触发发送');
    triggerSend(input);
    console.log('[Cuckoo Code] ✅ 已触发发送, 工具=' + toolCall.toolName + ', 长度=' + msg.length);
  }, sendDelay);
}

// 监听主进程发送的 systemPrompt
ipcRenderer.on('system-prompt', (_event, content) => {
  systemPromptContent = content || '';
  pendingSystemPrompt = true;
  // 如果当前已有新的空会话输入框，立即发送
  if (pendingSystemPrompt && systemPromptContent) {
    try {
      const input = findInputArea();
      if (input) {
        sendSystemPromptToInput();
      } else {
        // 等待输入框出现
        waitForInputAndSend();
      }
    } catch (e) {
    }
  }
});

// 监听主进程发送的初始提示（目录树+systemPrompt）
ipcRenderer.on('initial-prompt', (_event, content) => {
  initialPromptContent = content || '';
  pendingInitialPrompt = true;
  // 如果当前已有新的空会话输入框，立即发送
  if (pendingInitialPrompt && initialPromptContent) {
    try {
      const input = findInputArea();
      if (input) {
        sendInitialPromptToInput();
      } else {
        // 等待输入框出现
        waitForInitialPromptAndSend();
      }
    } catch (e) {
    }
  }
});

/**
 * 查找 DeepSeek 的输入框元素
 */
function findInputArea() {
  // 尝试多种常见的 textarea 选择器
  const selectors = [
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
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && isInputVisible(el)) {
      return el;
    }
  }

  // 额外搜索：查找包含特定文字的输入框
  const allTextareas = document.querySelectorAll('textarea');
  for (const ta of allTextareas) {
    const placeholder = (ta.placeholder || '').toLowerCase();
    if (placeholder && (placeholder.includes('deepseek') || placeholder.includes('message') || placeholder.includes('ask') || placeholder.includes('send'))) {
      return ta;
    }
  }

  return null;
}

/**
 * 检查元素是否可见
 */
function isInputVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

/**
 * 发送 system prompt 到输入框
 */
function sendSystemPromptToInput() {
  if (!systemPromptContent) {
    pendingSystemPrompt = false;
    return false;
  }

  const input = findInputArea();
  if (!input) {
    return false;
  }

  try {
    // 如果是 textarea，直接设置 value 并派发事件
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.focus();
      input.value = systemPromptContent;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
      input.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, systemPromptContent);
    }

    // 触发发送（2-4s 随机等待，模拟人工输入节奏）
    const sendDelay = randomDelay();
    console.log('[Cuckoo Code] ⏳ system prompt 已填入，随机等待 ' + sendDelay + 'ms 后发送...');
    setTimeout(() => {
      console.log('[Cuckoo Code] ✅ 等待结束，开始发送 system prompt');
      triggerSend(input);
      pendingSystemPrompt = false;
    }, sendDelay);

    return true;
  } catch (err) {
    console.error('[Cuckoo Code] 发送 system prompt 失败:', err.message);
    return false;
  }
}

/**
 * 发送初始提示（目录树+systemPrompt）到输入框
 */
function sendInitialPromptToInput() {
  if (!initialPromptContent) {
    pendingInitialPrompt = false;
    return false;
  }

  const input = findInputArea();
  if (!input) {
    return false;
  }

  try {
    // 如果是 textarea，直接设置 value 并派发事件
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.focus();
      input.value = initialPromptContent;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
      input.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, initialPromptContent);
    }

    // 触发发送（2-4s 随机等待，模拟人工输入节奏）
    const sendDelay = randomDelay();
    console.log('[Cuckoo Code] ⏳ 初始提示已填入，随机等待 ' + sendDelay + 'ms 后发送...');
    setTimeout(() => {
      console.log('[Cuckoo Code] ✅ 等待结束，开始发送初始提示');
      triggerSend(input);
      pendingInitialPrompt = false;
    }, sendDelay);

    return true;
  } catch (err) {
    console.error('[Cuckoo Code] 发送初始提示 失败:', err.message);
    return false;
  }
}

/**
 * 等待输入框出现后再发送 system prompt
 */
function waitForInputAndSend() {
  let attempts = 0;
  const maxAttempts = 30;

  const checkInterval = setInterval(() => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(checkInterval);
      pendingSystemPrompt = false;
      return;
    }

    if (findInputArea()) {
      clearInterval(checkInterval);
      sendSystemPromptToInput();
    }
  }, 500);
}

/**
 * 等待输入框出现后再发送初始提示
 */
function waitForInitialPromptAndSend() {
  let attempts = 0;
  const maxAttempts = 30;

  const checkInterval = setInterval(() => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(checkInterval);
      pendingInitialPrompt = false;
      return;
    }

    if (findInputArea()) {
      clearInterval(checkInterval);
      sendInitialPromptToInput();
    }
  }, 500);
}

/**
 * 触发发送消息
 */
function triggerSend(input) {
  // 方法 1: 查找发送按钮（按钮仅在输入框有内容时才可用）
  const sendSelectors = [
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
  ];

  for (const sel of sendSelectors) {
    const btn = document.querySelector(sel);
    if (btn && isInputVisible(btn) && !btn.disabled) {
      btn.click();
      console.log('[Cuckoo Code] 已点击发送按钮: ' + sel);
      return;
    }
  }

  // 方法 2: 在输入框上模拟完整 Enter 按键序列（keydown + keypress + keyup）
  if (input) {
    const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, isComposing: false };
    input.dispatchEvent(new KeyboardEvent('keydown', opts));
    input.dispatchEvent(new KeyboardEvent('keypress', opts));
    input.dispatchEvent(new KeyboardEvent('keyup', opts));
    console.log('[Cuckoo Code] 已通过 Enter 键触发发送 (未找到发送按钮)');
  }
}

/**
 * 查找新建会话按钮并监听点击
 */
function findNewSessionButton() {
  const selectors = [
    'button[title*="新建"]',
    'button[title*="New"]',
    'button[aria-label*="新建"]',
    'button[aria-label*="New"]',
    'button[data-action*="new"]',
    'button[data-action*="chat"]',
    '.new-chat-btn',
    '.new-session-btn',
    '.sidebar-new-btn',
    '[data-testid="new-chat"]',
    'button:has(svg[data-icon="plus"])',
    'button:has(svg[data-icon="add"])',
    'button:has(svg[data-icon="new"])',
    '.nav-new-chat',
    'div:has(> span[data-icon="plus"])',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && isInputVisible(el)) {
      return el;
    }
  }

  // 搜索包含"新建"文字的元素
  const allButtons = document.querySelectorAll('button, [role="button"]');
  for (const btn of allButtons) {
    const text = (btn.textContent || '').trim();
    const title = (btn.getAttribute('title') || '').trim();
    const aria = (btn.getAttribute('aria-label') || '').trim();
    if ((text.includes('新建') || title.includes('新建') || aria.includes('新建')) && isInputVisible(btn)) {
      return btn;
    }
  }

  return null;
}

/**
 * 监听新建会话按钮点击
 */
function setupNewSessionListener() {
  const btn = findNewSessionButton();
  if (!btn) {
    setTimeout(setupNewSessionListener, 5000);
    return;
  }


  // 监听点击事件
  const clickHandler = () => {

    // 重置状态
    pendingSystemPrompt = true;
    systemPromptContent = systemPromptContent;

    // 等待新会话的输入框出现，然后发送 system prompt
    setTimeout(() => {
      waitForInputAndSend();
    }, 1500);
  };

  // 使用 event capture 确保在页面脚本之前捕获点击
  btn.addEventListener('click', clickHandler, true);

  // 使用 MutationObserver 重新绑定（按钮可能被替换）
  const observer = new MutationObserver(() => {
    btn.removeEventListener('click', clickHandler, true);
    setTimeout(() => setupNewSessionListener(), 1000);
  });
  observer.observe(btn.parentElement || document.body, { childList: true, subtree: true });
}

// 启动新建会话监听
setTimeout(setupNewSessionListener, 3000);

// ========== 拦截 DeepSeek API 响应（注入到主世界） ==========

console.log('[Cuckoo Code] 安装 API 拦截器（注入主世界）...');

// 监听来自主世界拦截器的消息
window.addEventListener('message', (e) => {
  if (e.data && e.data.source === 'cuckoo-interceptor') {
    console.log('[Cuckoo Code] [拦截] AI回复全文:');
    console.log(e.data.content);
    processAIContent(e.data.content);
  }
});

// 注入拦截脚本到主世界（绕过 contextIsolation）
const interceptScript = document.createElement('script');
interceptScript.textContent = `(${function() {
  // 在主世界拦截 fetch
  const origFetch = window.fetch;
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
    const response = await origFetch.call(window, input, init);
    if (url && (url.includes('chat') || url.includes('completion'))) {
      window.postMessage({ source: 'cuckoo-interceptor', url: url, type: 'fetch' }, '*');
      const cloned = response.clone();
      const ct = response.headers.get('content-type') || '';
      if (ct.includes('text/event-stream')) {
        // SSE streaming
        const reader = cloned.body.getReader();
        const decoder = new TextDecoder();
        let buf = '', content = '';
        (async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\\n');
            buf = lines.pop() || '';
            for (const line of lines) {
              if (line.startsWith('data: ') && line.slice(6) !== '[DONE]') {
                try { content += JSON.parse(line.slice(6))?.choices?.[0]?.delta?.content || ''; } catch(e) {}
              }
            }
          }
          if (content) window.postMessage({ source: 'cuckoo-interceptor', content: content }, '*');
        })();
      } else {
        cloned.text().then(body => {
          try {
            const c = JSON.parse(body)?.choices?.[0]?.message?.content;
            if (c) window.postMessage({ source: 'cuckoo-interceptor', content: c }, '*');
          } catch(e) {}
        });
      }
    }
    return response;
  };

  // 在主世界拦截 XHR
  const OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new OrigXHR();
    const origOpen = xhr.open;
    let url = '';
    xhr.open = function(m, u) { url = u; return origOpen.apply(xhr, arguments); };
    xhr.addEventListener('load', function() {
      if (url && (url.includes('chat') || url.includes('completion'))) {
        window.postMessage({ source: 'cuckoo-interceptor', url: url, type: 'xhr' }, '*');
        try {
          const text = xhr.responseText;
          // SSE extract
          let content = '';
          for (const line of text.split('\\n')) {
            if (line.startsWith('data: ') && line.slice(6) !== '[DONE]') {
              try { content += JSON.parse(line.slice(6))?.choices?.[0]?.delta?.content || ''; } catch(e) {}
            }
          }
          // or JSON
          if (!content) {
            try { content = JSON.parse(text)?.choices?.[0]?.message?.content || ''; } catch(e) {}
          }
          if (content) window.postMessage({ source: 'cuckoo-interceptor', content: content }, '*');
        } catch(e) {}
      }
    });
    return xhr;
  };
  window.XMLHttpRequest.prototype = OrigXHR.prototype;

  // 在主世界拦截 EventSource
  const OrigES = window.EventSource;
  window.EventSource = function(url, config) {
    const es = new OrigES(url, config);
    let content = '';
    es.addEventListener('message', function(e) {
      try { content += JSON.parse(e.data)?.choices?.[0]?.delta?.content || ''; } catch(err) {}
    });
    const origClose = es.close;
    es.close = function() {
      if (content) window.postMessage({ source: 'cuckoo-interceptor', content: content }, '*');
      return origClose.call(es);
    };
    return es;
  };
  window.EventSource.prototype = OrigES.prototype;
  window.EventSource.CONNECTING = OrigES.CONNECTING;
  window.EventSource.OPEN = OrigES.OPEN;
  window.EventSource.CLOSED = OrigES.CLOSED;
}}.toString())()`;

// 等待 DOM 就绪后再注入
/**
 * 将 API 拦截脚本注入到主世界（绕过 contextIsolation）
 * 通过 document.documentElement 或 head/body 注入 script 标签
 */
function injectInterceptor() {
  const root = document.documentElement || document.head || document.body;
  if (root) {
    root.appendChild(interceptScript);
    interceptScript.remove();
    console.log('[Cuckoo Code] 拦截器已注入主世界');
  } else {
    setTimeout(injectInterceptor, 10);
  }
}
injectInterceptor();

/**
 * 检测 AI 回复中是否包含工具调用 JSON，如有则执行
 */
function processAIContent(content) {
  if (!content || typeof content !== 'string') return;

  const toolCall = tryParseToolCall(content);
  if (toolCall) {
    console.log('[Cuckoo Code] API拦截: 检测到工具调用，自动执行');
    notifyToolCallDetected(toolCall);
    handleToolCall(toolCall);
  }
}

// ========== 初始化 ==========

/**
 * 初始化 Cuckoo Code 扩展
 * 注入样式、覆盖层 HTML，绑定事件，启动 MutationObserver 和目录监听
 */
function init() {
  try {
    injectCSS();
    injectOverlay();

// 项目目录显示与修改功能
/**
 * 更新项目目录显示
 * @param {string} dirPath - 目录路径
 */
function updateProjectDirDisplay(dirPath) {
  const display = document.getElementById('cuckoo-project-dir-display');
  if (display) {
    const span = display.querySelector('.cuckoo-dir-path');
    if (span) {
      span.textContent = dirPath || '未选择';
    }
  }
  // 控制整个section的显示隐藏
  const section = document.querySelector('.cuckoo-project-dir-section');
  if (section) {
    if (dirPath && dirPath.trim() !== '') {
      section.style.display = '';
    } else {
      section.style.display = 'none';
    }
  }
}

// 初始化隐藏（如果没有目录）
updateProjectDirDisplay(null);

// 监听主进程的目录更新事件
ipcRenderer.on('project-dir-updated', (_event, dirPath) => {
  updateProjectDirDisplay(dirPath);
  // 目录更新后刷新会话列表
  renderSessions();
});

// 绑定修改按钮事件 - 直接绑定，阻止冒泡和默认行为
setTimeout(() => {
  const changeBtn = document.getElementById('cuckoo-btn-change-dir');
  if (changeBtn) {
    changeBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 使用 updateProjectDir 只更新目录映射，不重新发送初始提示
      const result = await window.electronAPI.updateProjectDir();
      if (result && result.success) {
        // 主进程会发送 project-dir-updated 事件更新显示
        console.log('[Cuckoo Code] 目录已更新');
      } else {
        console.error('修改目录失败:', result?.message);
      }
    });
  }
}, 100);
    bindEvents();

    // 默认显示覆盖层 - 兜底强制显示
    forceShowOverlay();

    // 延迟启动观察器，等待页面框架渲染
    setTimeout(startObserver, 2000);
  } catch (err) {
    console.error('[Cuckoo Code] init() 出错:', err);
    // 兜底：即使出错也强制显示面板
    forceShowOverlay();
  }

  // 定期巡检：防止面板被意外隐藏
  startOverlayWatcher();
}

/**
 * 强制显示覆盖层（移除所有隐藏状态）
 * 用于兜底恢复因异常被隐藏的面板
 */
function forceShowOverlay() {
  const overlay = document.getElementById('cuckoo-overlay');
  if (overlay) {
    overlay.classList.remove('cuckoo-hidden');
    overlay.style.transform = 'translateX(0)';
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
  }
}

/**
 * 启动定期巡检，防止面板被意外隐藏（最小化、ESC、脚本错误等）
 * 每 5 秒检查一次，如果被隐藏则自动恢复
 */
function startOverlayWatcher() {
  setInterval(() => {
    const overlay = document.getElementById('cuckoo-overlay');
    if (overlay && overlay.classList.contains('cuckoo-hidden')) {
      forceShowOverlay();
    }
  }, 5000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

