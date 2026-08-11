const { contextBridge, ipcRenderer } = require('electron');

// ========== 暴露给渲染进程的 API ==========
contextBridge.exposeInMainWorld('electronAPI', {
  executeCommand: (command, id) => {
    return ipcRenderer.invoke('execute-command', { command, id });
  },
  initProject: () => {
    return ipcRenderer.invoke('init-project');
  },
});

// ========== 覆盖层 UI 注入 ==========

const OVERLAY_HTML = `
<div id="cuckoo-overlay" class="cuckoo-overlay cuckoo-hidden">
  <div class="cuckoo-header">
    <span class="cuckoo-title">🤖 Cuckoo Code - 命令检测</span>
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
      console.log('[Cuckoo Code] 初始化成功:', result.message);
    } else {
      alert(result.message || '初始化失败');
    }
  } catch (err) {
    console.error('[Cuckoo Code] 初始化出错:', err.message);
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
  document.getElementById('cuckoo-btn-minimize')?.addEventListener('click', hideOverlay);
  document.getElementById('cuckoo-btn-execute')?.addEventListener('click', handleExecute);
  document.getElementById('cuckoo-btn-ignore')?.addEventListener('click', handleIgnore);
  document.getElementById('cuckoo-btn-init')?.addEventListener('click', handleInitProject);
  document.getElementById('cuckoo-btn-send-prompt')?.addEventListener('click', handleSendPrompt);
  document.getElementById('cuckoo-btn-clear')?.addEventListener('click', () => {
    commandHistory.length = 0;
    renderHistory();
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
    const result = await window.electronAPI.initProject();
    console.log('[Cuckoo Code] 初始化结果:', result);
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

function startObserver() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        const commands = scanForCommands(mutation.addedNodes);
        for (const cmd of commands) {
          displayCommand({ command: cmd, timestamp: Date.now(), id: generateId() });
        }
      }
    }
  });

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

// 监听主进程发送的 systemPrompt
ipcRenderer.on('system-prompt', (_event, content) => {
  console.log('[Cuckoo Code] 收到 system prompt, 长度:', content?.length);
  systemPromptContent = content || '';
  pendingSystemPrompt = true;
  // 如果当前已有新的空会话输入框，立即发送
  if (pendingSystemPrompt && systemPromptContent) {
    try {
      const input = findInputArea();
      if (input) {
        console.log('[Cuckoo Code] 页面已就绪，直接发送 system prompt');
        sendSystemPromptToInput();
      } else {
        // 等待输入框出现
        waitForInputAndSend();
      }
    } catch (e) {
      console.log('[Cuckoo Code] 当前无法找到输入框，等待后续触发');
    }
  }
});

// 监听主进程发送的初始提示（目录树+systemPrompt）
ipcRenderer.on('initial-prompt', (_event, content) => {
  console.log('[Cuckoo Code] 收到初始提示, 长度:', content?.length);
  initialPromptContent = content || '';
  pendingInitialPrompt = true;
  // 如果当前已有新的空会话输入框，立即发送
  if (pendingInitialPrompt && initialPromptContent) {
    try {
      const input = findInputArea();
      if (input) {
        console.log('[Cuckoo Code] 页面已就绪，直接发送初始提示');
        sendInitialPromptToInput();
      } else {
        // 等待输入框出现
        waitForInitialPromptAndSend();
      }
    } catch (e) {
      console.log('[Cuckoo Code] 当前无法找到输入框，等待后续触发');
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
    console.log('[Cuckoo Code] 找不到输入框');
    return false;
  }

  try {
    // 如果是 textarea，直接设置 value 并派发事件
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.focus();
      input.value = systemPromptContent;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[Cuckoo Code] system prompt 已填入输入框');
    } else if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
      input.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, systemPromptContent);
      console.log('[Cuckoo Code] system prompt 已填入 contentEditable');
    }

    // 触发发送（等待一小会儿确保输入完成）
    setTimeout(() => {
      triggerSend(input);
      pendingSystemPrompt = false;
    }, 500);

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
    console.log('[Cuckoo Code] 找不到输入框');
    return false;
  }

  try {
    // 如果是 textarea，直接设置 value 并派发事件
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.focus();
      input.value = initialPromptContent;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[Cuckoo Code] 初始提示 已填入输入框');
    } else if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
      input.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, initialPromptContent);
      console.log('[Cuckoo Code] 初始提示 已填入 contentEditable');
    }

    // 触发发送（等待一小会儿确保输入完成）
    setTimeout(() => {
      triggerSend(input);
      pendingInitialPrompt = false;
    }, 500);

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
      console.log('[Cuckoo Code] 等待输入框超时，不再尝试');
      pendingSystemPrompt = false;
      return;
    }

    if (findInputArea()) {
      clearInterval(checkInterval);
      console.log('[Cuckoo Code] 找到输入框，发送 system prompt');
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
      console.log('[Cuckoo Code] 等待输入框超时，不再尝试');
      pendingInitialPrompt = false;
      return;
    }

    if (findInputArea()) {
      clearInterval(checkInterval);
      console.log('[Cuckoo Code] 找到输入框，发送初始提示');
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
      console.log('[Cuckoo Code] 已点击发送按钮');
      return;
    }
  }

  // 方法 2: 在输入框上按 Enter
  if (input) {
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
    input.dispatchEvent(enterEvent);
    console.log('[Cuckoo Code] 已通过键盘 Enter 发送');
  } else {
    console.log('[Cuckoo Code] 无法找到发送按钮或输入框');
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
    console.log('[Cuckoo Code] 未找到新建会话按钮，5秒后重试');
    setTimeout(setupNewSessionListener, 5000);
    return;
  }

  console.log('[Cuckoo Code] 找到新建会话按钮:', btn.tagName, btn.textContent?.trim() || btn.getAttribute('title') || '(无文字)');

  // 监听点击事件
  const clickHandler = () => {
    console.log('[Cuckoo Code] 检测到新建会话按钮点击');

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
  injectCSS();
  injectOverlay();
  bindEvents();

  // 延迟启动观察器，等待页面框架渲染
  setTimeout(startObserver, 2000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

console.log('[Cuckoo Code] Preload 已加载');