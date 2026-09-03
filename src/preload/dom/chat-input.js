/**
 * 聊天输入框交互：查找输入框、填入与发送消息、工具结果回传
 * 由原 preload.js 拆分而来，逻辑保持不变。
 */
const { ipcRenderer } = require('electron');
const state = require('./state');
const { BT } = require('./js-detector');
const { getProviderByUrl } = require('../../../src/providers');

/**
 * 根据当前 URL 获取 provider
 */
function getCurrentProvider() {
  return getProviderByUrl(window.location.href);
}

/**
 * 生成随机等待时间（ms），范围由 state 配置（默认 2-4 秒）
 */
function randomDelay() {
  const min = typeof state.sendDelayMin === 'number' ? state.sendDelayMin : 2000;
  const max = typeof state.sendDelayMax === 'number' ? state.sendDelayMax : 4000;
  if (min >= max) return min;
  return Math.floor(Math.random() * (max - min)) + min;
}
/**
 * 将文本填入输入框（React 兼容：使用原生 value setter）
 * @param {Element} input - 输入框元素
 * @param {string} msg - 要填入的文本
 * @returns {boolean} 是否成功填入
 */
function setInputContent(input, msg) {
  try {
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(
        input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        'value'
      ).set;
      nativeSetter.call(input, msg);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
      input.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, msg);
      return true;
    }
    return false;
  } catch (err) {
    console.error('[Cuckoo Code] 设置输入框内容失败:', err.message);
    return false;
  }
}
/**
 * 将消息填入当前可见输入框并按指定延迟触发发送
 * @param {string} msg - 要发送的消息
 * @param {string} [tag] - 日志标记
 * @param {number} [fixedDelay] - 固定延迟毫秒数；缺省时使用 randomDelay()
 * @param {Function} [afterSent] - 发送后回调
 * @returns {boolean} 是否成功
 */
function sendToChat(msg, tag, fixedDelay, afterSent) {
  const input = findInputArea();
  if (!input) {
    console.log('[Cuckoo Code] 找不到输入框，无法发送消息');
    return false;
  }
  if (!setInputContent(input, msg)) {
    return false;
  }
  const sendDelay = fixedDelay !== undefined ? fixedDelay : randomDelay();
  console.log('[Cuckoo Code] 消息已填入输入框，等待 ' + sendDelay + 'ms 后发送...');
  setTimeout(function() {
    console.log('[Cuckoo Code] 等待结束，开始触发发送');
    triggerSend(input);
    console.log('[Cuckoo Code] 已触发发送, ' + (tag || '') + ', 长度=' + msg.length);
    if (typeof afterSent === 'function') afterSent();
  }, sendDelay);
  return true;
}
/**
 * 将消息填入 DeepSeek 聊天输入框并触发发送（工具结果回传的公共实现）
 */
function sendMessageToChat(msg, tag) {
  return sendToChat(msg, tag);
}
/**
 * 将 JSON 工具执行结果发送回 DeepSeek 聊天，让 AI 看到结果并继续工作
 */
function sendToolResultToChat(toolCall, result) {
  // 构造回传消息（明确的成功/失败信息，AI 可据此修正并继续）
  let msg;
  if (result.success) {
    const data = result.data || {};
    // 大内容截断保护（20KB），避免超长消息
    if (typeof data.content === 'string' && data.content.length > 20000) {
      data.content = data.content.substring(0, 20000) + String.fromCharCode(10) + '...[内容过长已截断]...';
    }
    msg = '【工具执行结果】' + toolCall.toolName + ' 执行成功 (callId: ' + (toolCall.callId || '') + ')' + String.fromCharCode(10) +
      JSON.stringify(data, null, 2);
  } else {
    msg = '【工具执行结果】' + toolCall.toolName + ' 执行失败 (callId: ' + (toolCall.callId || '') + ')' + String.fromCharCode(10) +
      '错误原因: ' + (result.error || '未知错误') + String.fromCharCode(10) +
      '请根据错误原因修正参数后重新调用工具。';
  }

  console.log('[Cuckoo Code] 回传工具结果, 消息长度=' + msg.length);
  sendMessageToChat(msg, '工具=' + toolCall.toolName);
}
/**
 * 将 JS 工具脚本执行结果发送回 DeepSeek 聊天，让 AI 看到结果并继续工作
 */
function sendCombinedJsResultsToChat(results) {
  if (!Array.isArray(results) || results.length === 0) return;

  const MAX_OUTPUT = 15000;
  const sep = String.fromCharCode(10);

  let msg = '【JS 执行结果汇总】(共 ' + results.length + ' 个脚本)' + sep + sep;

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    msg += '—— 脚本 ' + (i + 1) + ' ——' + sep;
    if (item && item.result && item.result.success) {
      let out = (item.result.output || '').trim();
      if (out.length > MAX_OUTPUT) {
        out = out.slice(0, MAX_OUTPUT) + sep + '...[输出过长已截断]...';
      }
      msg += '✅ 成功' + sep + (out || '(脚本执行完成，无输出)');
    } else {
      msg += '❌ 失败' + sep + '错误原因: ' + ((item && item.result && item.result.error) || '未知错误') + sep;
      msg += '本次实际执行的代码(前300字符):' + sep + String((item && item.code) || '').slice(0, 300) + sep;
      msg += '请修正 JavaScript 代码后重新输出完整的 ' + BT + BT + BT + 'cuckoo 代码块。';
    }
    msg += sep + sep;
  }

  console.log('[Cuckoo Code] 回传 JS 汇总执行结果, 消息长度=' + msg.length);
  sendMessageToChat(msg, 'JS汇总');
}
/**
 * 查找 DeepSeek 的输入框元素
 */
function findInputArea() {
  const provider = getCurrentProvider();

  if (provider) {
    // 按 provider 定义的选择器查找
    for (const sel of provider.inputSelectors || []) {
      try {
        const el = document.querySelector(sel);
        if (el && isInputVisible(el)) return el;
      } catch (_) {}
    }
  }

  // 通用兜底：找所有可见 textarea
  const allTextareas = document.querySelectorAll('textarea');
  for (const ta of allTextareas) {
    if (isInputVisible(ta)) return ta;
  }
  // 再找 contenteditable 或 textbox
  const editable = document.querySelector('div[contenteditable="true"], [role="textbox"]');
  if (editable && isInputVisible(editable)) return editable;

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
  if (!state.systemPromptContent) {
    state.pendingSystemPrompt = false;
    return false;
  }

  const input = findInputArea();
  if (!input) {
    return false;
  }

  if (!setInputContent(input, state.systemPromptContent)) {
    return false;
  }

  const sendDelay = randomDelay();
  console.log('[Cuckoo Code] system prompt 已填入，随机等待 ' + sendDelay + 'ms 后发送...');
  setTimeout(function() {
    console.log('[Cuckoo Code] 等待结束，开始发送 system prompt');
    triggerSend(input);
    state.pendingSystemPrompt = false;
  }, sendDelay);

  return true;
}
/**
 * 发送初始提示（目录树+systemPrompt）到输入框
 */
function sendInitialPromptToInput() {
  if (!state.initialPromptContent) {
    state.pendingInitialPrompt = false;
    return false;
  }

  const input = findInputArea();
  if (!input) {
    return false;
  }

  if (!setInputContent(input, state.initialPromptContent)) {
    return false;
  }

  const sendDelay = randomDelay();
  console.log('[Cuckoo Code] 初始提示已填入，随机等待 ' + sendDelay + 'ms 后发送...');
  setTimeout(function() {
    console.log('[Cuckoo Code] 等待结束，开始发送初始提示');
    triggerSend(input);
    state.pendingInitialPrompt = false;
  }, sendDelay);

  return true;
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
      state.pendingSystemPrompt = false;
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
      state.pendingInitialPrompt = false;
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
  const provider = getCurrentProvider();

  // 方法 1: 按 provider 定义的发送按钮选择器查找
  if (provider) {
    for (const sel of provider.sendButtonSelectors || []) {
      try {
        const btn = document.querySelector(sel);
        if (btn && isInputVisible(btn) && !btn.disabled) {
          btn.click();
          console.log('[Cuckoo Code] 已点击发送按钮: ' + sel);
          return;
        }
      } catch (_) {}
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
    state.pendingSystemPrompt = true;

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

/**
 * 注册主进程消息监听（system-prompt / initial-prompt）
 * 与原 preload.js 顶层注册时机一致：preload 入口加载时同步调用。
 */
function registerIpcListeners() {
// 监听主进程发送的 systemPrompt
ipcRenderer.on('system-prompt', (_event, content) => {
  state.systemPromptContent = content || '';
  state.pendingSystemPrompt = true;
  // 如果当前已有新的空会话输入框，立即发送
  if (state.pendingSystemPrompt && state.systemPromptContent) {
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
  state.initialPromptContent = content || '';
  state.pendingInitialPrompt = true;
  // 如果当前已有新的空会话输入框，立即发送
  if (state.pendingInitialPrompt && state.initialPromptContent) {
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
}


module.exports = {
  randomDelay,
  setInputContent,
  sendToChat,
  sendMessageToChat,
  sendToolResultToChat,
  sendCombinedJsResultsToChat,
  findInputArea,
  isInputVisible,
  sendSystemPromptToInput,
  sendInitialPromptToInput,
  waitForInputAndSend,
  waitForInitialPromptAndSend,
  triggerSend,
  findNewSessionButton,
  setupNewSessionListener,
  registerIpcListeners,
};
