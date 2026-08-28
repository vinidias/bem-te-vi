/**
 * 覆盖层按钮事件绑定
 * 由原 preload.js 拆分而来，逻辑保持不变。
 */
const state = require('../dom/state');
const { hideOverlay, showOverlay, renderHistory, commandHistory, showToast } = require('./ui');
const { handleInitProject, renderSessions } = require('../dom/session-list');
const { handleManualParse } = require('../dom/observer');
const { sendSystemPromptToInput, sendToChat } = require('../dom/chat-input');

/**
 * 发送系统提示词按钮点击处理
 */
function handleSendPrompt() {
  if (!state.systemPromptContent) {
    showToast('系统提示词内容为空', 3000);
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
    showToast('未找到输入框，请确保已打开聊天界面', 3000);
  }
}

/**
 * 绑定覆盖层所有 UI 事件
 * 包括按钮点击、键盘快捷键、状态徽章点击等
 */
function bindEvents() {
  // 从 localStorage 恢复延迟配置
  try {
    const savedMin = localStorage.getItem('cuckoo-send-delay-min');
    const savedMax = localStorage.getItem('cuckoo-send-delay-max');
    if (savedMin) state.sendDelayMin = parseInt(savedMin, 10) || 2000;
    if (savedMax) state.sendDelayMax = parseInt(savedMax, 10) || 4000;
    // 同步到输入框
    const minInput = document.getElementById('cuckoo-delay-min');
    const maxInput = document.getElementById('cuckoo-delay-max');
    if (minInput) minInput.value = state.sendDelayMin;
    if (maxInput) maxInput.value = state.sendDelayMax;
  } catch (e) {}

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

  // 保存延迟设置按钮
  const saveDelayBtn = document.getElementById('cuckoo-btn-save-delay');
  const delayMinInput = document.getElementById('cuckoo-delay-min');
  const delayMaxInput = document.getElementById('cuckoo-delay-max');
  saveDelayBtn?.addEventListener('click', () => {
    const min = parseInt(delayMinInput?.value, 10);
    const max = parseInt(delayMaxInput?.value, 10);
    if (Number.isNaN(min) || min < 0) { showToast('最小延迟必须是非负整数', 3000); return; }
    if (Number.isNaN(max) || max < min) { showToast('最大延迟不能小于最小延迟', 3000); return; }
    if (max > 10000) { showToast('最大延迟不能超过 10000ms', 3000); return; }
    state.sendDelayMin = min;
    state.sendDelayMax = max;
    // 保存到 localStorage
    try {
      localStorage.setItem('cuckoo-send-delay-min', String(min));
      localStorage.setItem('cuckoo-send-delay-max', String(max));
    } catch (e) {}
    showToast('延迟设置已保存：' + min + ' - ' + max + ' ms', 3000);
  });

  // 悬浮球点击切换面板显隐
  const statusBadge = document.getElementById('cuckoo-status-badge');
  statusBadge?.addEventListener('click', () => {
    const overlay = document.getElementById('cuckoo-overlay');
    if (!overlay) return;
    if (overlay.classList.contains('cuckoo-hidden')) {
      showOverlay();
    } else {
      hideOverlay();
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
