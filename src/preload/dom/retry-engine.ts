/**
 * 失败自动重试引擎
 * 订阅 intercept-observer 的 cuckoo-ai-error 事件，按配置退避后发送提示词，
 * 触发 AI 重新回答。成功回复会重置计数。
 *
 * 配置来源：localStorage（每窗口独立）
 *  - cuckoo-retry-enabled        '1' | '0'  默认 '1'
 *  - cuckoo-retry-delay-min      毫秒，默认 4000
 *  - cuckoo-retry-delay-max      毫秒，默认 10000
 *  - cuckoo-retry-count          普通失败次数，默认 10；负数=无限
 *  - cuckoo-retry-429-delay      毫秒，默认 60000
 *  - cuckoo-retry-429-count      429 次数，默认 20；负数=无限
 *  - cuckoo-retry-prompt         提示词文案
 */
import { sendToChat } from './chat-input.js';
import { onAiError, onInterceptedResponse } from './intercept-observer.js';
import { showToast } from '../overlay/ui.js';
import { withLog } from '../../infra/with-log.js';
import { getProviderByUrl } from '../../../src/providers/index.js';

const DEFAULT_PROMPT = '刚才的回复似乎中断了，请重新完整回答上一个问题。';
const DEFAULTS = {
  enabled: true,
  delayMin: 4000,
  delayMax: 10000,
  count: 10,
  delay429: 60000,
  count429: 20,
  prompt: DEFAULT_PROMPT,
};

let readConfig = function readConfig(): any {
  const cfg = Object.assign({}, DEFAULTS);
  try {
    const en = localStorage.getItem('cuckoo-retry-enabled');
    if (en !== null) cfg.enabled = en === '1';
    const dmin = parseInt(localStorage.getItem('cuckoo-retry-delay-min'), 10);
    if (Number.isFinite(dmin)) cfg.delayMin = dmin;
    const dmax = parseInt(localStorage.getItem('cuckoo-retry-delay-max'), 10);
    if (Number.isFinite(dmax)) cfg.delayMax = dmax;
    const cnt = parseInt(localStorage.getItem('cuckoo-retry-count'), 10);
    if (Number.isFinite(cnt)) cfg.count = cnt;
    const d429 = parseInt(localStorage.getItem('cuckoo-retry-429-delay'), 10);
    if (Number.isFinite(d429)) cfg.delay429 = d429;
    const c429 = parseInt(localStorage.getItem('cuckoo-retry-429-count'), 10);
    if (Number.isFinite(c429)) cfg.count429 = c429;
    const p = localStorage.getItem('cuckoo-retry-prompt');
    if (p) cfg.prompt = p;
  } catch (e) { /* ignore */ }
  return cfg;
};

let pickDelay = function pickDelay(min: any, max: any): number {
  if (!Number.isFinite(min) || min < 0) min = 0;
  if (!Number.isFinite(max) || max < min) max = min;
  if (min === max) return min;
  return Math.floor(Math.random() * (max - min)) + min;
};

/** 取当前页面 URL 对应的会话 ID（无则返回 null） */
function getCurrentSessionId(): string | null {
  try {
    const provider = getProviderByUrl(window.location.href);
    if (provider && typeof provider.extractSessionId === 'function') {
      return provider.extractSessionId(window.location.href) || null;
    }
  } catch (_) { /* ignore */ }
  return null;
}

let normalCount = 0;
let count429 = 0;
let pending: any = null;
let compacting = false;

let setCompacting = function setCompacting(v: any): void {
  compacting = !!v;
};

let clearPending = function clearPending(): void {
  if (!pending) return;
  if (pending.timer) clearTimeout(pending.timer);
  if (pending.countdownTimer) clearInterval(pending.countdownTimer);
  pending = null;
  const box = document.getElementById('cuckoo-retry-countdown');
  if (box) box.classList.add('cuckoo-hidden');
};

let onSuccess = function onSuccess(): void {
  normalCount = 0;
  count429 = 0;
  clearPending();
};

let cancelPending = function cancelPending(): void {
  clearPending();
  showToast('已取消自动重试', 2000);
};

let showCountdown = function showCountdown(totalMs: number): any {
  const box = ensureCountdownBox();
  const textEl = box.querySelector('#cuckoo-retry-countdown-text');
  const cancelBtn = box.querySelector('#cuckoo-retry-cancel');
  cancelBtn.onclick = cancelPending;
  box.classList.remove('cuckoo-hidden');

  let remain = Math.ceil(totalMs / 1000);
  function render() {
    if (textEl) textEl.textContent = '请求失败，' + remain + ' 秒后自动重试...';
  }
  render();
  const cd = setInterval(() => {
    remain -= 1;
    if (remain <= 0) { clearInterval(cd); return; }
    render();
  }, 1000);
  return cd;
};

let ensureCountdownBox = function ensureCountdownBox(): any {
  let box = document.getElementById('cuckoo-retry-countdown');
  if (box) return box;
  box = document.createElement('div');
  box.id = 'cuckoo-retry-countdown';
  box.className = 'cuckoo-retry-countdown cuckoo-hidden';
  box.innerHTML =
    '<div class="cuckoo-retry-countdown-inner">' +
    '  <span id="cuckoo-retry-countdown-text">等待重试...</span>' +
    '  <button id="cuckoo-retry-cancel" class="cuckoo-btn-text">取消</button>' +
    '</div>';
  document.body.appendChild(box);
  return box;
};

let handleError = function handleError(detail: any): void {
  const cfg = readConfig();
  if (!cfg.enabled) return;
  if (compacting) return;
  // 会话校验：错误发生时的会话与当前会话不一致 → 忽略（旧会话的延迟失败）
  if (detail && detail.sessionId !== undefined) {
    const cur = getCurrentSessionId();
    if (detail.sessionId !== cur) {
      console.log('[Cuckoo Code][重试] 会话已切换（' + detail.sessionId + ' -> ' + cur + '），忽略旧会话的错误');
      return;
    }
  }

  const is429 = detail && detail.httpStatus === 429;
  if (is429) {
    if (cfg.count429 >= 0 && count429 >= cfg.count429) {
      showToast('429 超限重试已达上限（' + cfg.count429 + ' 次），停止自动重试', 4000);
      clearPending();
      return;
    }
    count429++;
  } else {
    if (cfg.count >= 0 && normalCount >= cfg.count) {
      showToast('自动重试已达上限（' + cfg.count + ' 次），停止自动重试', 4000);
      clearPending();
      return;
    }
    normalCount++;
  }

  clearPending();
  const delay = is429
    ? (Number.isFinite(cfg.delay429) ? cfg.delay429 : 60000)
    : pickDelay(cfg.delayMin, cfg.delayMax);

  const cdTimer = showCountdown(delay);
  const timer = setTimeout(() => {
    const box = document.getElementById('cuckoo-retry-countdown');
    if (box) box.classList.add('cuckoo-hidden');
    if (pending && pending.countdownTimer) clearInterval(pending.countdownTimer);
    pending = null;
    try {
      sendToChat(cfg.prompt, is429 ? '重试(429)' : '重试', 300);
    } catch (e: any) {
      console.error('[Cuckoo Code][重试] 发送提示词失败: ' + e.message);
    }
  }, delay);

  pending = { kind: is429 ? '429' : 'normal', timer: timer, countdownTimer: cdTimer, remainMs: delay };
};

let started = false;
let startRetryEngine = function startRetryEngine(): void {
  if (started) return;
  started = true;
  onAiError(handleError);
  onInterceptedResponse(() => onSuccess());
  console.log('[Cuckoo Code][重试] 自动重试引擎已启动');
};

// ===== 类 AOP：为所有方法自动加调用日志（含内部互调）=====
// 原理：用 let 声明的函数表达式绑定可重新赋值，模块内部调用在运行时按标识符查找，
// 因此重赋值后内部互调也会走到带日志的版本。
readConfig = withLog(readConfig, 'retry.readConfig');
pickDelay = withLog(pickDelay, 'retry.pickDelay');
setCompacting = withLog(setCompacting, 'retry.setCompacting');
clearPending = withLog(clearPending, 'retry.clearPending');
onSuccess = withLog(onSuccess, 'retry.onSuccess');
cancelPending = withLog(cancelPending, 'retry.cancelPending');
showCountdown = withLog(showCountdown, 'retry.showCountdown');
ensureCountdownBox = withLog(ensureCountdownBox, 'retry.ensureCountdownBox');
handleError = withLog(handleError, 'retry.handleError');
startRetryEngine = withLog(startRetryEngine, 'retry.startRetryEngine');

export { startRetryEngine, setCompacting, readConfig, DEFAULT_PROMPT };
