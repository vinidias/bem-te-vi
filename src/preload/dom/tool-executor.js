/**
 * 工具/JS 脚本执行器（与回复获取方式无关）
 * 拦截模式和 DOM 模式共用的执行逻辑：执行工具调用、执行 JS 脚本、通知 UI。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { showToast, setTaskStatus, addHistory, truncate, flashBadge } = require('../overlay/ui');
const { sendToolResultToChat } = require('./chat-input');

// 是否正在执行命令或工具
let isExecuting = false;

/**
 * 通知用户检测到工具调用（闪烁状态徽章 + 更新预览）
 */
function notifyToolCallDetected(toolCall) {
  const preview = document.getElementById('cuckoo-cmd-preview');
  if (preview) {
    preview.textContent = '[工具] ' + toolCall.toolName + '\n参数: ' + JSON.stringify(toolCall.params, null, 2);
  }
  flashBadge('Cuckoo Code - 工具调用检测到');
}

/**
 * 通知用户检测到 JS 工具脚本（更新预览 + 闪烁徽章）
 */
function notifyJsScriptDetected(code) {
  const preview = document.getElementById('cuckoo-cmd-preview');
  if (preview) {
    preview.textContent = '[JS 工具脚本]' + String.fromCharCode(10) + code;
  }
  flashBadge('Cuckoo Code - JS 工具脚本检测到');
}

/**
 * 执行检测到的 JS 工具脚本
 * @param {string} code
 * @returns {Promise<{code: string, result: object}>}
 */
async function handleJsToolScript(code) {
  isExecuting = true;
  notifyJsScriptDetected(code);
  setTaskStatus(true);
  showToast('开始执行命令');

  const callId = 'js_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  console.log('[Cuckoo Code] [诊断] 即将执行的代码(JSON转义): ' + JSON.stringify(code));
  try {
    const result = await window.electronAPI.executeJs(code, callId);

    const resultSection = document.getElementById('cuckoo-result-section');
    const resultStatus = document.getElementById('cuckoo-result-status');
    const resultOutput = document.getElementById('cuckoo-result-output');
    if (resultSection) resultSection.classList.remove('cuckoo-hidden');

    if (result.success) {
      if (resultStatus) {
        resultStatus.textContent = '✅ JS 脚本执行成功';
        resultStatus.className = 'cuckoo-result-status success';
      }
      if (resultOutput) {
        resultOutput.textContent = result.output || '(脚本执行完成，无输出)';
      }
    } else {
      if (resultStatus) {
        resultStatus.textContent = '❌ JS 脚本执行失败';
        resultStatus.className = 'cuckoo-result-status error';
      }
      if (resultOutput) {
        resultOutput.textContent = result.error || '未知错误';
      }
    }

    addHistory({
      id: callId,
      command: '[JS] ' + truncate((code.split(String.fromCharCode(10))[0] || code), 60),
      success: result.success,
      output: result.success ? (result.output || '') : (result.error || '未知错误'),
      timestamp: Date.now(),
    });

    return { code, result };
  } catch (err) {
    console.error('[Cuckoo Code] JS 工具脚本执行异常:', err);
    const resultSection = document.getElementById('cuckoo-result-section');
    const resultStatus = document.getElementById('cuckoo-result-status');
    const resultOutput = document.getElementById('cuckoo-result-output');
    if (resultSection) resultSection.classList.remove('cuckoo-hidden');
    if (resultStatus) {
      resultStatus.textContent = '❌ 系统错误';
      resultStatus.className = 'cuckoo-result-status error';
    }
    if (resultOutput) {
      resultOutput.textContent = err.message || String(err);
    }
    return { code, result: { success: false, error: '系统异常: ' + (err.message || String(err)) } };
  } finally {
    isExecuting = false;
    setTaskStatus(false);
  }
}

/**
 * 执行工具调用
 */
async function handleToolCall(toolCall) {
  const { toolName, params, callId } = toolCall;
  console.log('[Cuckoo Code] 执行工具: ' + toolName, params);

  isExecuting = true;
  setTaskStatus(true);
  showToast('开始执行命令');

  try {
    const result = await window.electronAPI.executeTool(toolName, params, callId);

    const resultSection = document.getElementById('cuckoo-result-section');
    const resultStatus = document.getElementById('cuckoo-result-status');
    const resultOutput = document.getElementById('cuckoo-result-output');

    if (resultSection) resultSection.classList.remove('cuckoo-hidden');

    if (result.success) {
      if (resultStatus) {
        resultStatus.textContent = '✅ 工具 ' + toolName + ' 执行成功';
        resultStatus.className = 'cuckoo-result-status success';
      }
      if (resultOutput) {
        resultOutput.textContent = JSON.stringify(result.data, null, 2);
      }
    } else {
      if (resultStatus) {
        resultStatus.textContent = '❌ 工具 ' + toolName + ' 执行失败';
        resultStatus.className = 'cuckoo-result-status error';
      }
      if (resultOutput) {
        resultOutput.textContent = result.error || '未知错误';
      }
    }

    addHistory({
      id: callId,
      command: '[工具] ' + toolName,
      success: result.success,
      output: result.success ? JSON.stringify(result.data, null, 2) : (result.error || '未知错误'),
      timestamp: Date.now(),
    });

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
    sendToolResultToChat(toolCall, { success: false, error: '系统异常: ' + (err.message || String(err)) });
  } finally {
    isExecuting = false;
    setTaskStatus(false);
  }
}

export {
  handleToolCall,
  handleJsToolScript,
  notifyToolCallDetected,
  notifyJsScriptDetected,
};
