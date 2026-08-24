/**
 * 覆盖层按钮事件绑定
 * 由原 preload.js 拆分而来，逻辑保持不变。
 */
const state = require('../dom/state');
const { hideOverlay, showOverlay, renderHistory, commandHistory } = require('./ui');
const { handleInitProject, renderSessions } = require('../dom/session-list');
const { handleManualParse } = require('../dom/observer');
const { sendSystemPromptToInput, sendToChat } = require('../dom/chat-input');

/**
 * 发送系统提示词按钮点击处理
 */
function handleSendPrompt() {
  if (!state.systemPromptContent) {
    alert('系统提示词内容为空');
    return;
  }
  sendSystemPromptToInput();
}

/**
 * 生成项目说明文档按钮点击处理
 */
function handleGenerateDoc() {
  const message = '根据当前项目生成一个类似 claude.md 的项目说明文件，并将文件放到当前项目 .cuckooCode/CUCKOO.md';
  if (!sendToChat(message, '生成文档', 300)) {
    alert('未找到输入框，请确保已打开聊天界面');
  }
}

/**
 * 绑定覆盖层所有 UI 事件
 * 包括按钮点击、键盘快捷键、状态徽章点击等
 */
function bindEvents() {
  const minimizeBtn = document.getElementById('cuckoo-btn-minimize');
  const initBtn = document.getElementById('cuckoo-btn-init');
  const sendPromptBtn = document.getElementById('cuckoo-btn-send-prompt');
  const clearBtn = document.getElementById('cuckoo-btn-clear');

  minimizeBtn?.addEventListener('click', hideOverlay);
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

module.exports = bindEvents;
