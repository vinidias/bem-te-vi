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
const { sendToChat } = require('./chat-input');
const { onAiError, onInterceptedResponse } = require('./intercept-observer');
const { showToast } = require('../overlay/ui');

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

function readConfig() {
  console.log('[CK][retry] >> readConfig 进入');
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
  } catch (e) { console.log('[CK][retry] readConfig 读取异常: ' + (e && e.message)); }
  console.log('[CK][retry] << readConfig 返回 ' + JSON.stringify(cfg));
  return cfg;
}

function pickDelay(min, max) {
  if (!Number.isFinite(min) || min < 0) min = 0;
  if (!Number.isFinite(max) || max < min) max = min;
  var r;
  if (min === max) r = min;
  else r = Math.floor(Math.random() * (max - min)) + min;
  console.log('[CK][retry] pickDelay(' + min + ',' + max + ') => ' + r);
  return r;
}

let normalCount = 0;
let count429 = 0;
let pending = null;
let compacting = false;

function setCompacting(v) {
  compacting = !!v;
  console.log('[CK][retry] setCompacting => ' + compacting);
}

function clearPending() {
  console.log('[CK][retry] >> clearPending，当前 pending=' + (pending ? pending.kind : 'null'));
  if (!pending) { console.log('[CK][retry] << clearPending（无 pending）'); return; }
  if (pending.timer) clearTimeout(pending.timer);
  if (pending.countdownTimer) clearInterval(pending.countdownTimer);
  pending = null;
  const box = document.getElementById('cuckoo-retry-countdown');
  if (box) box.classList.add('cuckoo-hidden');
  console.log('[CK][retry] << clearPending 完成');
}

function onSuccess() {
  console.log('[CK][retry] >> onSuccess（成功回复，重置计数）normalCount=' + normalCount + ' count429=' + count429);
  normalCount = 0;
  count429 = 0;
  clearPending();
  console.log('[CK][retry] << onSuccess 完成');
}

function cancelPending() {
  console.log('[CK][retry] >> cancelPending（用户取消）');
  clearPending();
  showToast('已取消自动重试', 2000);
  console.log('[CK][retry] << cancelPending 完成');
}

function showCountdown(totalMs) {
  console.log('[CK][retry] >> showCountdown totalMs=' + totalMs);
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
  console.log('[CK][retry] 倒计时框已显示，剩余 ' + remain + ' 秒');
  const cd = setInterval(() => {
    remain -= 1;
    if (remain <= 0) { console.log('[CK][retry] 倒计时结束'); clearInterval(cd); return; }
    render();
  }, 1000);
  return cd;
}

function ensureCountdownBox() {
  let box = document.getElementById('cuckoo-retry-countdown');
  if (box) { console.log('[CK][retry] ensureCountdownBox 复用已存在'); return box; }
  console.log('[CK][retry] ensureCountdownBox 新建');
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
}

function handleError(detail) {
  console.log('[CK][retry] >> handleError 收到失败事件 detail=' + JSON.stringify(detail || null));
  const cfg = readConfig();
  console.log('[CK][retry] handleError enabled=' + cfg.enabled + ' compacting=' + compacting + ' reason=' + (detail && detail.reason) + ' httpStatus=' + (detail && detail.httpStatus) + ' normalCount=' + normalCount + ' count429=' + count429);
  if (!cfg.enabled) { console.log('[CK][retry] << handleError 开关关闭，跳过'); return; }
  if (compacting) { console.log('[CK][retry] << handleError 压缩中，跳过'); return; }

  const is429 = detail && detail.httpStatus === 429;
  console.log('[CK][retry] handleError is429=' + is429);
  if (is429) {
    if (cfg.count429 >= 0 && count429 >= cfg.count429) {
      console.log('[CK][retry] << handleError 429 达上限 ' + cfg.count429 + '，停止');
      showToast('429 超限重试已达上限（' + cfg.count429 + ' 次），停止自动重试', 4000);
      clearPending();
      return;
    }
    count429++;
    console.log('[CK][retry] handleError 429 计数 +1 => ' + count429);
  } else {
    if (cfg.count >= 0 && normalCount >= cfg.count) {
      console.log('[CK][retry] << handleError 普通失败达上限 ' + cfg.count + '，停止');
      showToast('自动重试已达上限（' + cfg.count + ' 次），停止自动重试', 4000);
      clearPending();
      return;
    }
    normalCount++;
    console.log('[CK][retry] handleError 普通计数 +1 => ' + normalCount);
  }

  clearPending();
  const delay = is429
    ? (Number.isFinite(cfg.delay429) ? cfg.delay429 : 60000)
    : pickDelay(cfg.delayMin, cfg.delayMax);
  console.log('[CK][retry] handleError 安排重试 delay=' + delay + 'ms');

  const cdTimer = showCountdown(delay);
  const timer = setTimeout(() => {
    console.log('[CK][retry] >> 重试定时器触发（delay=' + delay + 'ms）');
    const box = document.getElementById('cuckoo-retry-countdown');
    if (box) box.classList.add('cuckoo-hidden');
    if (pending && pending.countdownTimer) clearInterval(pending.countdownTimer);
    pending = null;
    try {
      console.log('[CK][retry] 发送重试提示词 prompt=' + JSON.stringify(cfg.prompt) + ' tag=' + (is429 ? '重试(429)' : '重试'));
      sendToChat(cfg.prompt, is429 ? '重试(429)' : '重试', 300);
      console.log('[CK][retry] << 重试提示词已发送');
    } catch (e) {
      console.error('[CK][retry] 发送提示词失败: ' + e.message);
    }
  }, delay);

  pending = { kind: is429 ? '429' : 'normal', timer: timer, countdownTimer: cdTimer, remainMs: delay };
  console.log('[CK][retry] << handleError 已安排 pending kind=' + pending.kind);
}

let started = false;
function startRetryEngine() {
  console.log('[CK][retry] >> startRetryEngine started=' + started);
  if (started) { console.log('[CK][retry] << startRetryEngine 已启动过，跳过'); return; }
  started = true;
  onAiError(handleError);
  onInterceptedResponse(() => onSuccess());
  console.log('[Cuckoo Code][重试] 自动重试引擎已启动');
  console.log('[CK][retry] << startRetryEngine 完成订阅');
}

module.exports = { startRetryEngine, setCompacting, readConfig, DEFAULT_PROMPT };
