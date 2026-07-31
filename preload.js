const { contextBridge, ipcRenderer } = require('electron');

console.log('[Cuckoo AI] Preload script 开始执行');

// ========== 统一工具系统 (内联到 preload) ==========

class ToolResult {
  constructor(success, data, error) {
    this.success = success;
    this.data = data;
    this.error = error;
  }
  static success(data) { return new ToolResult(true, data, null); }
  static error(error) { return new ToolResult(false, null, error); }
}

class UnifiedToolManager {
  constructor() {
    this.tools = new Map();
    this.registerBuiltinTools();
  }

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
  }

  register(name, definition) {
    this.tools.set(name, definition);
    console.log('[ToolManager] 注册工具:', name);
  }

  getToolsDescription() {
    return Array.from(this.tools.values()).map((t, i) => {
      const params = t.parameters.properties ? Object.keys(t.parameters.properties).join(', ') : '无';
      return `${i + 1}. **${t.name}** - ${t.description}\n   参数: ${params}`;
    }).join('\n\n');
  }

  getToolsSchema() {
    const schemas = {};
    for (const [name, tool] of this.tools) {
      schemas[name] = tool.parameters;
    }
    return schemas;
  }

  parseToolCall(input) {
    if (!input) return null;
    let parsed = null;

    if (typeof input === 'object' && input !== null) {
      parsed = input;
    } else if (typeof input === 'string') {
      const str = input.trim();
      const codeBlockMatch = str.match(/^```(?:tool|json)?\s*\n?(\{[\s\S]*\})\s*```?$/);
      if (codeBlockMatch) {
        try { parsed = JSON.parse(codeBlockMatch[1]); } catch (e) { return null; }
      } else {
        try { parsed = JSON.parse(str); } catch (e) { return null; }
      }
    }
    if (!parsed || !parsed.toolName) return null;
    return {
      toolName: parsed.toolName,
      params: parsed.params || parsed.parameters || parsed.arguments || {},
      callId: parsed.callId || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

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
    return { success: false, error: `未实现的工具: ${toolName}` };
  }

  getSystemPrompt() {
    const tools = Array.from(this.tools.values());
    let prompt = '# 可用工具\n\n';
    for (const tool of this.tools.values()) {
      prompt += `## ${tool.name}\n${tool.description}\n\n`;
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
    prompt += `## 调用格式\n\n请使用以下格式调用工具（仅输出 JSON，不要包含其他文字）：\n\n\`\`\`json\n{\n  "toolName": "工具名称",\n  "params": { "参数名": "参数值" },\n  "callId": "call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}"\n}\n\`\`\`\n`;
    return prompt;
  }
}

// 实例化工具管理器
const toolManager = new UnifiedToolManager();
console.log('[Cuckoo AI] 统一工具管理器已初始化');

// ========== 暴露给渲染进程的 API ==========
// 尝试 contextBridge，如果失败则直接挂载到 window（作为 fallback）
let electronAPI = {
  executeCommand: (command, id) => {
    return ipcRenderer.invoke('execute-command', { command, id });
  },
  initProject: () => {
    return ipcRenderer.invoke('init-project');
  },
  executeTool: (toolName, params, callId) => {
    return ipcRenderer.invoke('execute-tool', { toolName, params, callId });
  },
};

try {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  console.log('[Cuckoo AI] contextBridge.exposeInMainWorld 成功');
} catch (err) {
  console.error('[Cuckoo AI] contextBridge.exposeInMainWorld 失败:', err);
}

// 无论 contextBridge 是否成功，都直接挂载到 window 作为备选
window.electronAPI = electronAPI;
console.log('[Cuckoo AI] window.electronAPI 直接挂载完成:', !!window.electronAPI);

// ========== 覆盖层 UI 注入 ==========

const OVERLAY_HTML = `
<div id="cuckoo-overlay" class="cuckoo-overlay cuckoo-hidden">
  <div class="cuckoo-header">
    <span class="cuckoo-title">🤖 Cuckoo AI - 命令检测</span>
    <button id="cuckoo-btn-minimize" class="cuckoo-btn-icon">—</button>
  </div>
  <div class="cuckoo-body">
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
  <span id="cuckoo-status-dot"></span> Cuckoo AI 运行中
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
  display: flex; align-items: center; gap: 6px; pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
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
`;

// ========== 注入样式 ==========
function injectCSS() {
  const style = document.createElement('style');
  style.textContent = OVERLAY_CSS;
  document.head.appendChild(style);
}

// ========== 注入覆盖层 HTML ==========
function injectOverlay() {
  const container = document.createElement('div');
  container.id = 'cuckoo-root';
  container.innerHTML = OVERLAY_HTML;
  document.body.appendChild(container);
  console.log('[Cuckoo AI] injectOverlay - container appended, overlay element:', !!document.getElementById('cuckoo-overlay'));
  console.log('[Cuckoo AI] injectOverlay - init button:', !!document.getElementById('cuckoo-btn-init'));
}

// ========== 覆盖层逻辑 ==========

let currentCommand = null;
let isExecuting = false;
let commandIdCounter = 0;
const commandHistory = [];

function generateId() {
  return `cmd_${Date.now()}_${++commandIdCounter}`;
}

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function truncate(text, maxLen = 50) {
  if (!text || text.length <= maxLen) return text || '';
  return text.substring(0, maxLen) + '...';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showOverlay() {
  const el = document.getElementById('cuckoo-overlay');
  if (el) el.classList.remove('cuckoo-hidden');
}

function hideOverlay() {
  const el = document.getElementById('cuckoo-overlay');
  if (el) el.classList.add('cuckoo-hidden');
}

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
 * 尝试解析工具调用命令
 * 格式：```tool
 * {"toolName": "file_write", "params": {...}, "callId": "..."}
 * ```
 */
function tryParseToolCall(command) {
  // 检查是否以工具调用格式开始
  const toolMatch = command.trim().match(/^```(?:tool|json)?\s*\n?(\{[\s\S]*\})\s*```?$/);
  if (!toolMatch) return null;

  try {
    const parsed = JSON.parse(toolMatch[1]);
    // 验证是否包含必要字段
    if (parsed.toolName && typeof parsed.toolName === 'string') {
      return {
        toolName: parsed.toolName,
        params: parsed.params || {},
        callId: parsed.callId || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
    }
  } catch (e) {
    console.log('[Cuckoo AI] 解析工具调用失败:', e.message);
  }
  return null;
}

/**
 * 执行工具调用
 */
async function handleToolCall(toolCall) {
  const { toolName, params, callId } = toolCall;
  console.log(`[Cuckoo AI] 执行工具: ${toolName}`, params);

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
  } catch (err) {
    console.error('[Cuckoo AI] 工具执行异常:', err);
  }
}

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
 * 初始化项目按钮点击处理
 */
async function handleInitProject() {
  const btn = document.getElementById('cuckoo-btn-init');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ 初始化中...';
  }

  try {
    const result = await window.electronAPI.initProject();
    if (result.success) {
      console.log('[Cuckoo AI] 初始化成功:', result.message);
    } else {
      alert(result.message || '初始化失败');
    }
  } catch (err) {
    console.error('[Cuckoo AI] 初始化出错:', err.message);
    alert('初始化出错: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🚀 初始化项目';
    }
  }
}

function addHistory(entry) {
  commandHistory.unshift(entry);
  if (commandHistory.length > 50) commandHistory.pop();
  renderHistory();
}

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

function bindEvents() {
  const minimizeBtn = document.getElementById('cuckoo-btn-minimize');
  const executeBtn = document.getElementById('cuckoo-btn-execute');
  const ignoreBtn = document.getElementById('cuckoo-btn-ignore');
  const initBtn = document.getElementById('cuckoo-btn-init');
  const sendPromptBtn = document.getElementById('cuckoo-btn-send-prompt');
  const clearBtn = document.getElementById('cuckoo-btn-clear');

  console.log('[Cuckoo AI] bindEvents - 找到的按钮:', {
    minimizeBtn: !!minimizeBtn,
    executeBtn: !!executeBtn,
    ignoreBtn: !!ignoreBtn,
    initBtn: !!initBtn,
    sendPromptBtn: !!sendPromptBtn,
    clearBtn: !!clearBtn
  });

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

/**
 * 初始化项目按钮点击处理
 */
async function handleInitProject() {
  const initBtn = document.getElementById('cuckoo-btn-init');
  console.log('[Cuckoo AI] handleInitProject called, initBtn:', initBtn);
  console.log('[Cuckoo AI] window.electronAPI:', window.electronAPI);
  if (initBtn) {
    initBtn.disabled = true;
    initBtn.textContent = '⏳ 初始化中...';
  }

  try {
    // 调用主进程的 init-project IPC
    if (!window.electronAPI || !window.electronAPI.initProject) {
      throw new Error('window.electronAPI.initProject 不存在');
    }
    console.log('[Cuckoo AI] Calling electronAPI.initProject()...');
    const result = await window.electronAPI.initProject();
    console.log('[Cuckoo AI] 初始化结果:', result);
    if (result && !result.success) {
      alert(result.message || '初始化失败');
    }
  } catch (err) {
    console.error('[Cuckoo AI] 初始化项目失败:', err);
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
    console.log('[Cuckoo AI] 手动解析开始...');

    // 获取页面所有文本内容
    const pageText = document.body.innerText || document.body.textContent || '';
    console.log('[Cuckoo AI] 页面文本长度:', pageText.length);

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
      for (const block of codeBlocks) {
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

    console.log('[Cuckoo AI] 手动解析找到工具调用数量:', toolCalls.length);

    // 执行所有检测到的工具调用
    for (const toolCall of toolCalls) {
      console.log('[Cuckoo AI] 执行手动解析的工具调用:', toolCall);
      await handleToolCall(toolCall);
    }

    alert(`手动解析完成，共执行 ${toolCalls.length} 个工具调用`);
  } catch (err) {
    console.error('[Cuckoo AI] 手动解析出错:', err);
    alert('手动解析出错: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔍 手动解析';
    }
  }
}

// ========== DOM 监测：检测 ```cmd 代码块 ==========

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

const detectedSet = new WeakSet();

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

    // 检查 pre/code 代码块
    if (['PRE', 'CODE'].includes(node.tagName)) {
      if (!detectedSet.has(node)) {
        detectedSet.add(node);
        const text = node.textContent || node.innerText || '';
        if (text.includes('toolName') || text.includes('file_write') || text.includes('"tool"')) {
          const toolCall = tryParseToolCall(node.textContent || node.innerText || '');
          if (toolCall) toolCalls.push(toolCall);
        }
      }
    }

    // 检查子节点中的 pre/code
    const codeBlocks = node.querySelectorAll('pre, code');
    for (const block of codeBlocks) {
      if (!detectedSet.has(block)) {
        detectedSet.add(block);
        const text = block.textContent || block.innerText || '';
        if (text.includes('toolName') || text.includes('file_write') || text.includes('"tool"')) {
          const toolCall = tryParseToolCall(block.textContent || block.innerText || '');
          if (toolCall) toolCalls.push(toolCall);
        }
      }
    }

    // 检查 markdown 渲染后的内容（可能包含在 div 中）
    if (node.tagName === 'DIV') {
      const text = node.textContent || node.innerText || '';
      if (text.includes('toolName') || text.includes('file_write')) {
        const toolCall = tryParseToolCall(text);
        if (toolCall) toolCalls.push(toolCall);
      }
    }
  }
  return toolCalls;
}

// ========== AI 回复完成检测 ==========
/**
 * 检测 AI 是否已完成回复
 * 通过检查 DeepSeek 页面的 UI 状态判断
 * @returns {boolean} true 表示 AI 已完成回复
 */
function isAIResponseComplete() {
  try {
    // 1. 检查是否有典型的"正在生成"指示器
    const generatingIndicators = document.querySelectorAll(
      '[data-testid="generating"], .generating, .streaming, [data-state="streaming"], ' +
      '.typing-indicator, .thinking, [aria-busy="true"], ' +
      'button[disabled][aria-label*="stop"], button[disabled][aria-label*="停止"]'
    );
    if (generatingIndicators.length > 0) {
      console.log('[Cuckoo AI] 🔍 检测到正在生成指示器，等待完成...');
      return false;
    }

    // 2. 检查最后一条助手消息是否还在流式输出
    const assistantMessages = document.querySelectorAll(
      '[data-role="assistant"], [data-author="assistant"], .assistant-message, .bot-message, ' +
      '[data-testid="assistant-message"], .message-assistant'
    );

    if (assistantMessages.length > 0) {
      const lastMsg = assistantMessages[assistantMessages.length - 1];

      // 检查是否有流式输出的特征
      const streamingElements = lastMsg.querySelectorAll(
        '.streaming, .typing, .generating, [data-streaming="true"], ' +
        '.cursor, .blink, .animate-pulse'
      );
      if (streamingElements.length > 0) {
        console.log('[Cuckoo AI] 🔍 检测到最后一条消息正在流式输出中...');
        return false;
      }

      // 检查光标闪烁动画（常见于流式输出结束时）
      const cursors = lastMsg.querySelectorAll('.cursor, .blinking, .animate-blink');
      if (cursors.length > 0) {
        console.log('[Cuckoo AI] 🔍 检测到光标闪烁，输出可能未结束...');
        return false;
      }
    }

    // 3. 检查是否有"停止生成"按钮可见（表示正在生成）
    const stopButtons = document.querySelectorAll(
      'button[aria-label*="stop" i], button[aria-label*="停止" i], ' +
      'button[title*="stop" i], button[title*="停止" i]'
    );
    const visibleStopButton = Array.from(stopButtons).find(btn => {
      const style = window.getComputedStyle(btn);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
    if (stopButtons.length > 0 && !stopButtons.every(btn => btn.disabled)) {
      console.log('[Cuckoo AI] 🔍 检测到可用的停止按钮，正在生成中...');
      return false;
    }

    // 4. 检查是否有明显的"正在思考/生成中"文本
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    let hasGeneratingText = false;
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      if (text && (text.includes('生成中') || text.includes('思考中') ||
          text.includes('正在生成') || text.includes('Generating') ||
          text.includes('Thinking') || text.match(/^▌|▊|▋|█$/))) {
        hasGeneratingText = true;
        break;
      }
    }
    if (hasGeneratingText) {
      console.log('[Cuckoo AI] 🔍 检测到"生成中/思考中"文本...');
      return false;
    }

    // 所有检查通过，AI 可能已完成
    console.log('[Cuckoo AI] ✅ AI 回复完成检测通过，准备处理工具调用');
    return true;
  } catch (err) {
    console.error('[Cuckoo AI] ❌ 检测 AI 完成状态出错:', err);
    // 出错时保守返回 true，避免永远不处理
    return true;
  }
}

// ========== MutationObserver 防抖处理 ==========

  function processMutations(mutations) {
    if (isProcessing) return;

    // 关键：先检查 AI 是否真正完成了回复
    if (!isAIResponseComplete()) {
      console.log('[Cuckoo AI] ⏳ AI 回复尚未完成，等待继续输出...');
      console.log('[Cuckoo AI]    ├─ 当前状态检查: 仍在流式输出/生成中');
      return; // 直接返回，不处理本次 mutations，等待下一次
    }

    console.log('[Cuckoo AI] ✅ =========================================');
    console.log('[Cuckoo AI] ✅ 【判定完成】AI 回复已完全结束，开始处理工具调用');
    console.log('[Cuckoo AI] ✅ =========================================');
    console.log('[Cuckoo AI] 📊 本次处理详情:');
    console.log('[Cuckoo AI]    ├─ 触发原因: DOM 稳定 ≥ 2s + 无流式输出特征');
    console.log('[Cuckoo AI]    ├─ 待处理节点数: 待处理的新增节点数');

    isProcessing = true;

    try {
      // ... existing code

  const target = document.body || document.documentElement;
  if (target) {
    observer.observe(target, { childList: true, subtree: true });
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
function tryParseToolCall(content) {
  if (!content || typeof content !== 'string') return null;
  const str = content.trim();

  console.log('[Cuckoo AI] 尝试解析工具调用, 内容长度:', str.length);
  console.log('[Cuckoo AI] 内容前500字符:', str.substring(0, 500));

  // 先检查 JSON 是否可能完整（简单校验）
  if (!isJsonPotentiallyComplete(str)) {
    console.log('[Cuckoo AI] JSON 疑似不完整，等待更多内容...');
    return null;
  }

  // 1. 尝试直接解析 JSON
  let parsed = null;
  try {
    parsed = JSON.parse(str);
    console.log('[Cuckoo AI] 直接 JSON 解析成功:', parsed);
  } catch (e) {
    console.log('[Cuckoo AI] 直接 JSON 解析失败:', e.message);
  }

  // 2. 提取代码块 ```json ... ``` 或 ```tool ... ``` 或 ``` ... ```
  if (!parsed) {
    const codeBlockMatch = str.match(/^```(?:json|tool)?\s*\n?(\{[\s\S]*\})\s*```?$/);
    if (codeBlockMatch) {
      console.log('[Cuckoo AI] 代码块匹配内容:', codeBlockMatch[1].substring(0, 200));
      try {
        parsed = JSON.parse(codeBlockMatch[1]);
        console.log('[Cuckoo AI] 代码块 JSON 解析成功:', parsed);
      } catch (e) {
        console.log('[Cuckoo AI] 代码块 JSON 解析失败:', e.message);
      }
    } else {
      console.log('[Cuckoo AI] 未匹配到代码块格式');
    }
  }

  // 3. 尝试在文本中查找 JSON 对象
  if (!parsed) {
    const jsonMatch = str.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      console.log('[Cuckoo AI] 文本中提取到疑似 JSON:', jsonMatch[0].substring(0, 200));
      // 再次校验完整性
      if (isJsonPotentiallyComplete(jsonMatch[0])) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
          console.log('[Cuckoo AI] 文本中提取 JSON 解析成功:', parsed);
        } catch (e) {
          console.log('[Cuckoo AI] 文本中提取 JSON 解析失败:', e.message);
          console.log('[Cuckoo AI] 失败的 JSON 片段:', jsonMatch[0].substring(0, 300));
        }
      } else {
        console.log('[Cuckoo AI] 提取的 JSON 片段不完整，等待更多内容...');
      }
    } else {
      console.log('[Cuckoo AI] 文本中未找到任何花括号包裹内容');
    }
  }

  if (!parsed) {
    console.log('[Cuckoo AI] 所有解析尝试均失败');
    return null;
  }

  // 支持多种字段名：toolName/tool, params/parameters/arguments
  if (!parsed.toolName && !parsed.tool) {
    console.log('[Cuckoo AI] 缺少 toolName/tool 字段, 完整对象:', parsed);
    return null;
  }

  // 标准化输出
  const result = {
    toolName: parsed.toolName || parsed.tool,
    params: parsed.params || parsed.parameters || parsed.arguments || {},
    callId: parsed.callId || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  };
  console.log('[Cuckoo AI] 解析成功:', result);
  return result;
}

/**
 * 简单校验 JSON 字符串是否可能完整
 * @param {string} str
 * @returns {boolean}
 */
function isJsonPotentiallyComplete(str) {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false;

  // 简单的括号配对检查
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') braceCount++;
      else if (char === '}') braceCount--;
    }
  }

  // 括号必须配对平衡
  return braceCount === 0;
}

/**
 * 执行工具调用
 */
async function handleToolCall(toolCall) {
  const { toolName, params, callId } = toolCall;
  console.log(`[Cuckoo AI] 执行工具: ${toolName}`, params);

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
  } catch (err) {
    console.error('[Cuckoo AI] 工具执行异常:', err);
  }
}

/**
 * 检测新增节点中的工具调用
 */
function scanForToolCalls(nodes) {
  const toolCalls = [];
  for (const node of nodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    // 检查文本内容
    const text = node.textContent || node.innerText || '';
    if (text.includes('toolName') || text.includes('file_write')) {
      const toolCall = tryParseToolCall(text);
      if (toolCall) toolCalls.push(toolCall);
    }

    // 递归检查子节点
    if (node.querySelectorAll) {
      const codeBlocks = node.querySelectorAll('pre, code');
      for (const block of codeBlocks) {
        const text = block.textContent || block.innerText || '';
        if (text.includes('toolName') || text.includes('file_write')) {
          const toolCall = tryParseToolCall(text);
          if (toolCall) toolCalls.push(toolCall);
        }
      }
    }
  }
  return toolCalls;
}

// 监听主进程发送的 systemPrompt
ipcRenderer.on('system-prompt', (_event, content) => {
  console.log('[Cuckoo AI] 收到 system prompt, 长度:', content?.length);
  systemPromptContent = content || '';
  pendingSystemPrompt = true;
  // 如果当前已有新的空会话输入框，立即发送
  if (pendingSystemPrompt && systemPromptContent) {
    try {
      const input = findInputArea();
      if (input) {
        console.log('[Cuckoo AI] 页面已就绪，直接发送 system prompt');
        sendSystemPromptToInput();
      } else {
        // 等待输入框出现
        waitForInputAndSend();
      }
    } catch (e) {
      console.log('[Cuckoo AI] 当前无法找到输入框，等待后续触发');
    }
  }
});

// 监听主进程发送的初始提示（目录树+systemPrompt）
ipcRenderer.on('initial-prompt', (_event, content) => {
  console.log('[Cuckoo AI] 收到初始提示, 长度:', content?.length);
  initialPromptContent = content || '';
  pendingInitialPrompt = true;
  // 如果当前已有新的空会话输入框，立即发送
  if (pendingInitialPrompt && initialPromptContent) {
    try {
      const input = findInputArea();
      if (input) {
        console.log('[Cuckoo AI] 页面已就绪，直接发送初始提示');
        sendInitialPromptToInput();
      } else {
        // 等待输入框出现
        waitForInitialPromptAndSend();
      }
    } catch (e) {
      console.log('[Cuckoo AI] 当前无法找到输入框，等待后续触发');
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
    console.log('[Cuckoo AI] 找不到输入框');
    return false;
  }

  try {
    // 如果是 textarea，直接设置 value 并派发事件
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.focus();
      input.value = systemPromptContent;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[Cuckoo AI] system prompt 已填入输入框');
    } else if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
      input.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, systemPromptContent);
      console.log('[Cuckoo AI] system prompt 已填入 contentEditable');
    }

    // 触发发送（等待一小会儿确保输入完成）
    setTimeout(() => {
      triggerSend(input);
      pendingSystemPrompt = false;
    }, 500);

    return true;
  } catch (err) {
    console.error('[Cuckoo AI] 发送 system prompt 失败:', err.message);
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
    console.log('[Cuckoo AI] 找不到输入框');
    return false;
  }

  try {
    // 如果是 textarea，直接设置 value 并派发事件
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.focus();
      input.value = initialPromptContent;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[Cuckoo AI] 初始提示 已填入输入框');
    } else if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
      input.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, initialPromptContent);
      console.log('[Cuckoo AI] 初始提示 已填入 contentEditable');
    }

    // 触发发送（等待一小会儿确保输入完成）
    setTimeout(() => {
      triggerSend(input);
      pendingInitialPrompt = false;
    }, 500);

    return true;
  } catch (err) {
    console.error('[Cuckoo AI] 发送初始提示 失败:', err.message);
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
      console.log('[Cuckoo AI] 等待输入框超时，不再尝试');
      pendingSystemPrompt = false;
      return;
    }

    if (findInputArea()) {
      clearInterval(checkInterval);
      console.log('[Cuckoo AI] 找到输入框，发送 system prompt');
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
      console.log('[Cuckoo AI] 等待输入框超时，不再尝试');
      pendingInitialPrompt = false;
      return;
    }

    if (findInputArea()) {
      clearInterval(checkInterval);
      console.log('[Cuckoo AI] 找到输入框，发送初始提示');
      sendInitialPromptToInput();
    }
  }, 500);
}

/**
 * 触发发送消息
 */
function triggerSend(input) {
  // 方法 1: 查找发送按钮
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
  ];

  for (const sel of sendSelectors) {
    const btn = document.querySelector(sel);
    if (btn && isInputVisible(btn)) {
      btn.click();
      console.log('[Cuckoo AI] 已点击发送按钮');
      return;
    }
  }

  // 方法 2: 在输入框上按 Enter
  if (input) {
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
    input.dispatchEvent(enterEvent);
    console.log('[Cuckoo AI] 已通过键盘 Enter 发送');
  } else {
    console.log('[Cuckoo AI] 无法找到发送按钮或输入框');
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
    console.log('[Cuckoo AI] 未找到新建会话按钮，5秒后重试');
    setTimeout(setupNewSessionListener, 5000);
    return;
  }

  console.log('[Cuckoo AI] 找到新建会话按钮:', btn.tagName, btn.textContent?.trim() || btn.getAttribute('title') || '(无文字)');

  // 监听点击事件
  const clickHandler = () => {
    console.log('[Cuckoo AI] 检测到新建会话按钮点击');

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

// ========== 初始化 ==========

function init() {
  console.log('[Cuckoo AI] init() 开始执行');
  console.log('[Cuckoo AI] window.electronAPI:', window.electronAPI);
  console.log('[Cuckoo AI] document.readyState:', document.readyState);
  console.log('[Cuckoo AI] location.href:', location.href);

  try {
    injectCSS();
    console.log('[Cuckoo AI] injectCSS 完成');
    injectOverlay();
    console.log('[Cuckoo AI] injectOverlay 完成');
    bindEvents();
    console.log('[Cuckoo AI] bindEvents 完成');

    // 默认显示覆盖层 - 兜底强制显示
    forceShowOverlay();
    console.log('[Cuckoo AI] showOverlay 完成');

    // 延迟启动观察器，等待页面框架渲染
    setTimeout(startObserver, 2000);
    console.log('[Cuckoo AI] init() 执行完毕');
  } catch (err) {
    console.error('[Cuckoo AI] init() 出错:', err);
    // 兜底：即使出错也强制显示面板
    forceShowOverlay();
  }

  // 定期巡检：防止面板被意外隐藏
  startOverlayWatcher();
}

function forceShowOverlay() {
  const overlay = document.getElementById('cuckoo-overlay');
  if (overlay) {
    overlay.classList.remove('cuckoo-hidden');
    overlay.style.transform = 'translateX(0)';
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
    console.log('[Cuckoo AI] 🛡️ 强制显示覆盖层');
  }
}

// 定期巡检：防止面板被意外隐藏（最小化、ESC、脚本错误等）
function startOverlayWatcher() {
  // 每 5 秒检查一次，如果被隐藏则自动恢复
  setInterval(() => {
    const overlay = document.getElementById('cuckoo-overlay');
    if (overlay && overlay.classList.contains('cuckoo-hidden')) {
      console.log('[Cuckoo AI] 🛡️ 检测到面板被隐藏，自动恢复显示');
      forceShowOverlay();
    }
  }, 5000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

console.log('[Cuckoo AI] Preload 已加载');