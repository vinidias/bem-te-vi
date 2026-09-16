/**
 * 工具循环看门狗
 *
 * 目的：AI 进入"工具调用循环"后，若某轮发出消息却迟迟等不到回复（AI 卡住/中断），
 * 超时后发提示词催 AI 继续，避免任务无声中断。
 *
 * 开关时机：
 *  - 检测到工具调用            → 进入工具循环（inToolLoop=true），关看门狗
 *  - 发出消息等待 AI 回复       → 若在工具循环中，开看门狗计时
 *  - 收到任意终态（finished/stopped/error） → 关看门狗
 *  - 回复不含工具调用（纯文本）  → 退出工具循环，关看门狗
 *  - 看门狗超时                → 计数 +1，发提示词催继续，重新计时；超过上限则停止
 *
 * 配置（localStorage，每窗口独立）：
 *  - cuckoo-xhr-idle-timeout   等待超时（毫秒，默认 90000，<=0 禁用）
 *  - cuckoo-watchdog-prompt    超时提示词（默认"请继续"）
 *  - cuckoo-watchdog-count     最大催次数（默认 3，负数=无限）
 */
const { showToast } = require('../overlay/ui');

const DEFAULT_PROMPT = '请继续';
const DEFAULT_TIMEOUT = 90000;
const DEFAULT_COUNT = 3;

let inToolLoop = false;
let timer = null;
let timeoutCount = 0;
// 开启看门狗时所在会话的 ID，用于超时时校验会话是否已切换
let armedSessionId = null;

/** 取当前页面 URL 对应的会话 ID（无则返回 null） */
function getCurrentSessionId() {
  try {
    const { getProviderByUrl } = require('../../../src/providers');
    const provider = getProviderByUrl(window.location.href);
    if (provider && typeof provider.extractSessionId === 'function') {
      return provider.extractSessionId(window.location.href) || null;
    }
  } catch (_) { /* ignore */ }
  return null;
}

function readConfig() {
  let timeout = DEFAULT_TIMEOUT;
  let prompt = DEFAULT_PROMPT;
  let count = DEFAULT_COUNT;
  try {
    const t = parseInt(localStorage.getItem('cuckoo-xhr-idle-timeout'), 10);
    if (Number.isFinite(t)) timeout = t;
    const p = localStorage.getItem('cuckoo-watchdog-prompt');
    if (p) prompt = p;
    const c = parseInt(localStorage.getItem('cuckoo-watchdog-count'), 10);
    if (Number.isFinite(c)) count = c;
  } catch (_) {}
  return { timeout, prompt, count };
}

function clearTimer() {
  if (timer) { clearTimeout(timer); timer = null; }
}

function armWatchdog() {
  clearTimer();
  if (!inToolLoop) return;
  const cfg = readConfig();
  if (!(cfg.timeout > 0)) return; // <=0 禁用
  armedSessionId = getCurrentSessionId();
  timer = setTimeout(onTimeout, cfg.timeout);
}

function disarmWatchdog() {
  clearTimer();
}

function onTimeout() {
  timer = null;
  if (!inToolLoop) return;
  // 会话已切换：看门狗已失效，静默退出，不打扰新会话
  const nowSession = getCurrentSessionId();
  if (nowSession !== armedSessionId) {
    console.log('[Cuckoo Code][看门狗] 会话已切换（' + armedSessionId + ' -> ' + nowSession + '），跳过催继续');
    inToolLoop = false;
    timeoutCount = 0;
    return;
  }
  const cfg = readConfig();

  if (cfg.count >= 0 && timeoutCount >= cfg.count) {
    showToast('工具循环等待超时已达上限（' + cfg.count + ' 次），停止催继续', 4000);
    return;
  }
  timeoutCount++;
  showToast('等待 AI 回复超时，发送「' + cfg.prompt + '」催继续（第 ' + timeoutCount + ' 次）', 3000);
  try {
    const { sendToChat } = require('./chat-input');
    sendToChat(cfg.prompt, '看门狗', 300);
  } catch (e) {
    console.error('[Cuckoo Code][看门狗] 发送提示词失败: ' + e.message);
  }
}

/** 检测到工具调用：进入工具循环，先关看门狗（工具执行期间不监控） */
function onToolCallDetected() {
  inToolLoop = true;
  clearTimer();
}

/** 发出一条消息、等待 AI 回复：若在工具循环中则开看门狗 */
function onMessageSent() {
  if (inToolLoop) armWatchdog();
}

/** 收到任意终态回复：关看门狗；成功回复重置超时计数 */
function onResponseReceived(status) {
  clearTimer();
  if (status === 'finished') timeoutCount = 0;
}

/** 回复不含工具调用（纯文本）：退出工具循环 */
function exitToolLoop() {
  inToolLoop = false;
  timeoutCount = 0;
  armedSessionId = null;
  clearTimer();
}

/** 手动重置（压缩等流程可调用） */
function reset() {
  inToolLoop = false;
  timeoutCount = 0;
  armedSessionId = null;
  clearTimer();
}

// ===== 会话切换监视：SPA 路由（pushState）不触发 popstate/hashchange，
// 用轮询检测 session 变化，一旦切换立即重置看门狗，避免误打扰新会话。=====
let sessionWatcherTimer = null;
let lastSeenSessionId = null;

function startSessionWatcher() {
  if (sessionWatcherTimer) return;
  lastSeenSessionId = getCurrentSessionId();
  sessionWatcherTimer = setInterval(function () {
    const sid = getCurrentSessionId();
    if (sid !== lastSeenSessionId) {
      console.log('[Cuckoo Code][看门狗] 检测到会话切换（' + lastSeenSessionId + ' -> ' + sid + '），重置看门狗');
      lastSeenSessionId = sid;
      reset();
    }
  }, 1500);
}

module.exports = {
  onToolCallDetected,
  onMessageSent,
  onResponseReceived,
  exitToolLoop,
  reset,
  startSessionWatcher,
  _readConfig: readConfig,
  _isInLoop: () => inToolLoop,
};
