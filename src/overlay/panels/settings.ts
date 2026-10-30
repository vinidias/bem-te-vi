/**
 * Þ«¥þ¢«Õ╝╣þ¬ù´╝ÜÕèáÞ¢¢/õ┐ØÕ¡ÿ/µüóÕñìÚ╗ÿÞ«ñ´╝îõ╗ÑÕÅèÞç¬Õè¿ÕÄïþ╝®õ©Ä token µÿ¥þñ║
 * þö▒ events.ts µïåÕêåÞÇîµØÑ´╝êP4.5´╝ë´╝îÚÇ╗Þ¥æõ┐Øµîüõ©ìÕÅÿÒÇé
 */
import { showToast } from '../panel.js';
import { state } from '../state.js';

/** µëôÕ╝ÇÞ«¥þ¢«Õ╝╣þ¬ù´╝Üõ╗Ä localStorage ÕèáÞ¢¢Úàìþ¢«Õê░Þ¥ôÕàÑµíå */
function openSettings() {
  function setVal(id: string, v: any) {
    const el = document.getElementById(id);
    if (el) (el as any).value = v;
  }
  // localStorage Õ¡ÿµ»½þºÆ´╝îUI µÿ¥þñ║þºÆ´╝êµ»½þºÆ/1000´╝ë
  const msToSec = (ms: any, dft: any) => {
    const n = parseInt(ms, 10);
    return String(Number.isFinite(n) ? n / 1000 : dft);
  };
  try {
    const en = localStorage.getItem('cuckoo-retry-enabled');
    const enEl = document.getElementById('cuckoo-retry-enabled');
    if (enEl) (enEl as any).checked = en === null ? true : en === '1';
    setVal('cuckoo-retry-delay-min', msToSec(localStorage.getItem('cuckoo-retry-delay-min') || '4000', 4));
    setVal('cuckoo-retry-delay-max', msToSec(localStorage.getItem('cuckoo-retry-delay-max') || '10000', 10));
    setVal('cuckoo-retry-count', localStorage.getItem('cuckoo-retry-count') || '10');
    setVal('cuckoo-retry-429-delay', msToSec(localStorage.getItem('cuckoo-retry-429-delay') || '120000', 120));
    setVal('cuckoo-retry-429-count', localStorage.getItem('cuckoo-retry-429-count') || '40');
    setVal('cuckoo-retry-prompt', localStorage.getItem('cuckoo-retry-prompt') || 'ÕêÜµëìþÜäÕø×Õñìõ╝╝õ╣Äõ©¡µû¡õ║å´╝îÞ»ÀÚçìµû░Õ«îµò┤Õø×þ¡öõ©èõ©Çõ©¬Úù«ÚóÿÒÇé');
    setVal('cuckoo-xhr-idle-timeout', msToSec(localStorage.getItem('cuckoo-xhr-idle-timeout') || '300000', 300));
    setVal('cuckoo-watchdog-prompt', localStorage.getItem('cuckoo-watchdog-prompt') || 'Þ»Àþ╗ºþ╗¡');
    setVal('cuckoo-watchdog-count', localStorage.getItem('cuckoo-watchdog-count') || '3');
    setVal('cuckoo-attach-delay-min', msToSec(localStorage.getItem('cuckoo-attach-delay-min') || '500', 0.5));
    setVal('cuckoo-attach-delay-max', msToSec(localStorage.getItem('cuckoo-attach-delay-max') || '1000', 1));
  } catch (_) {}
  setVal('cuckoo-delay-min', state.sendDelayMin / 1000);
  setVal('cuckoo-delay-max', state.sendDelayMax / 1000);
  const panel = document.getElementById('cuckoo-settings');
  if (panel) panel.classList.remove('cuckoo-hidden');
}

/** Õà│Úù¡Þ«¥þ¢«Õ╝╣þ¬ù */
function closeSettings() {
  const panel = document.getElementById('cuckoo-settings');
  if (panel) panel.classList.add('cuckoo-hidden');
}

/** µüóÕñìÚ╗ÿÞ«ñ´╝ÜÕêáÚÖñµëÇµ£ëþø©Õà│ localStorage Úö«´╝îÚçìþ¢«ÕåàÕ¡ÿ state´╝îÕêÀµû░Õ╝╣þ¬ù */
function resetSettings() {
  const KEYS = [
    'cuckoo-retry-enabled', 'cuckoo-retry-delay-min', 'cuckoo-retry-delay-max',
    'cuckoo-retry-count', 'cuckoo-retry-429-delay', 'cuckoo-retry-429-count',
    'cuckoo-retry-prompt', 'cuckoo-xhr-idle-timeout', 'cuckoo-watchdog-prompt',
    'cuckoo-watchdog-count', 'cuckoo-send-delay-min', 'cuckoo-send-delay-max',
    'cuckoo-attach-delay-min', 'cuckoo-attach-delay-max',
  ];
  try {
    for (const k of KEYS) localStorage.removeItem(k);
  } catch (_) {}
  state.sendDelayMin = 2000;
  state.sendDelayMax = 4000;
  showToast('ÕÀ▓µüóÕñìÚ╗ÿÞ«ñÞ«¥þ¢«', 2500);
  openSettings(); // Úçìµû░ÕèáÞ¢¢Ú╗ÿÞ«ñÕÇ╝Õê░Þ¥ôÕàÑµíå
}

/** õ┐ØÕ¡ÿÞ«¥þ¢«Õ╝╣þ¬ùþÜäµëÇµ£ëÚàìþ¢« */
function saveSettings() {
  const val = (id: string) => { const el = document.getElementById(id); return el ? (el as any).value : ''; };
  // UI Þ¥ôÕàÑõ©║þºÆ´╝îÕ¡ÿÕé¿Þ¢¼µ»½þºÆ
  const secToMs = (s: any) => Math.round(parseFloat(s) * 1000);
  const dmin = secToMs(val('cuckoo-retry-delay-min'));
  const dmax = secToMs(val('cuckoo-retry-delay-max'));
  if (Number.isNaN(dmin) || dmin < 0) { showToast('µÖ«ÚÇÜÕñ▒Þ┤Ñµ£ÇÕ░ÅÚù┤ÚÜöÕ┐àÚí╗µÿ»ÚØ×Þ┤ƒµò░Õ¡ù´╝êþºÆ´╝ë', 3000); return; }
  if (Number.isNaN(dmax) || dmax < dmin) { showToast('µÖ«ÚÇÜÕñ▒Þ┤Ñµ£ÇÕñºÚù┤ÚÜöõ©ìÞâ¢Õ░Åõ║Äµ£ÇÕ░ÅÚù┤ÚÜö', 3000); return; }
  const cnt = parseInt(val('cuckoo-retry-count'), 10);
  if (Number.isNaN(cnt)) { showToast('µÖ«ÚÇÜÕñ▒Þ┤ÑÚçìÞ»òµ¼íµò░Õ┐àÚí╗µÿ»µò┤µò░', 3000); return; }
  const d429 = secToMs(val('cuckoo-retry-429-delay'));
  if (Number.isNaN(d429) || d429 < 0) { showToast('µôìõ¢£Úóæþ╣üÚçìÞ»òÚù┤ÚÜöÕ┐àÚí╗µÿ»ÚØ×Þ┤ƒµò░Õ¡ù´╝êþºÆ´╝ë', 3000); return; }
  const c429 = parseInt(val('cuckoo-retry-429-count'), 10);
  if (Number.isNaN(c429)) { showToast('µôìõ¢£Úóæþ╣üÚçìÞ»òµ¼íµò░Õ┐àÚí╗µÿ»µò┤µò░', 3000); return; }
  const prompt = val('cuckoo-retry-prompt').trim();
  if (!prompt) { showToast('ÚçìÞ»òµÅÉþñ║Þ»ìõ©ìÞâ¢õ©║þ®║', 3000); return; }
  const idleTimeout = secToMs(val('cuckoo-xhr-idle-timeout'));
  if (Number.isNaN(idleTimeout) || idleTimeout < 0) { showToast('µîéÞÁÀÞÂàµùÂÕ┐àÚí╗µÿ»ÚØ×Þ┤ƒµò░Õ¡ù´╝êþºÆ´╝ë', 3000); return; }
  const watchdogPrompt = val('cuckoo-watchdog-prompt').trim();
  if (!watchdogPrompt) { showToast('ÕÀÑÕàÀÕ¥¬þÄ»ÞÂàµùÂµÅÉþñ║Þ»ìõ©ìÞâ¢õ©║þ®║', 3000); return; }
  const watchdogCount = parseInt(val('cuckoo-watchdog-count'), 10);
  if (Number.isNaN(watchdogCount)) { showToast('ÕÀÑÕàÀÕ¥¬þÄ»Õé¼þ╗ºþ╗¡µ¼íµò░Õ┐àÚí╗µÿ»µò┤µò░', 3000); return; }
  const smin = secToMs(val('cuckoo-delay-min'));
  const smax = secToMs(val('cuckoo-delay-max'));
  if (Number.isNaN(smin) || smin < 0) { showToast('ÕÅæÚÇüÕ╗ÂÞ┐ƒµ£ÇÕ░ÅÕÇ╝Õ┐àÚí╗µÿ»ÚØ×Þ┤ƒµò░Õ¡ù´╝êþºÆ´╝ë', 3000); return; }
  if (Number.isNaN(smax) || smax < smin) { showToast('ÕÅæÚÇüÕ╗ÂÞ┐ƒµ£ÇÕñºÕÇ╝õ©ìÞâ¢Õ░Åõ║Äµ£ÇÕ░ÅÕÇ╝', 3000); return; }
  const amin = secToMs(val('cuckoo-attach-delay-min'));
  const amax = secToMs(val('cuckoo-attach-delay-max'));
  if (Number.isNaN(amin) || amin < 0) { showToast('ÚÖäõ╗Âõ©èõ╝áÚù┤ÚÜöµ£ÇÕ░ÅÕÇ╝Õ┐àÚí╗µÿ»ÚØ×Þ┤ƒµò░Õ¡ù´╝êþºÆ´╝ë', 3000); return; }
  if (Number.isNaN(amax) || amax < amin) { showToast('ÚÖäõ╗Âõ©èõ╝áÚù┤ÚÜöµ£ÇÕñºÕÇ╝õ©ìÞâ¢Õ░Åõ║Äµ£ÇÕ░ÅÕÇ╝', 3000); return; }
  if (amax > 60000) { showToast('ÚÖäõ╗Âõ©èõ╝áÚù┤ÚÜöµ£ÇÕñºÕÇ╝õ©ìÞâ¢ÞÂàÞ┐ç 60 þºÆ', 3000); return; }

  const enEl = document.getElementById('cuckoo-retry-enabled');
  try {
    localStorage.setItem('cuckoo-retry-enabled', (enEl && (enEl as any).checked) ? '1' : '0');
    localStorage.setItem('cuckoo-retry-delay-min', String(dmin));
    localStorage.setItem('cuckoo-retry-delay-max', String(dmax));
    localStorage.setItem('cuckoo-retry-count', String(cnt));
    localStorage.setItem('cuckoo-retry-429-delay', String(d429));
    localStorage.setItem('cuckoo-retry-429-count', String(c429));
    localStorage.setItem('cuckoo-retry-prompt', prompt);
    localStorage.setItem('cuckoo-xhr-idle-timeout', String(idleTimeout));
    localStorage.setItem('cuckoo-watchdog-prompt', watchdogPrompt);
    localStorage.setItem('cuckoo-watchdog-count', String(watchdogCount));
    localStorage.setItem('cuckoo-send-delay-min', String(smin));
    localStorage.setItem('cuckoo-send-delay-max', String(smax));
    localStorage.setItem('cuckoo-attach-delay-min', String(amin));
    localStorage.setItem('cuckoo-attach-delay-max', String(amax));
  } catch (_) {}
  state.sendDelayMin = smin;
  state.sendDelayMax = smax;
  showToast('Þ«¥þ¢«ÕÀ▓õ┐ØÕ¡ÿ', 2500);
  closeSettings();
}

// ========== þ║»µò░µì«Þ»╗ÕåÖ´╝êõ¥ø IPC´╝ÜÕú│ÚíÁÚØóÞ«¥þ¢«ÚíÁÞ░âþö¿´╝ë ==========
// Þ«¥þ¢«õ╗ìõ╗Ñ localStorage õ©║Õö»õ©Çµò░µì«µ║É´╝êAI ÚíÁÚØó loop / hook Ú£ÇÕÉîµ¡ÑÞ»╗´╝îõ©ìÞâ¢µÉ¼ÞÁ░´╝ëÒÇé
// µ£¼þ╗äÕç¢µò░ÕÅ¬Þ┤ƒÞ┤ú"Þ»╗ ÔåÆ Þ┐öÕø× UI Õìòõ¢ìÕÇ╝" / "µáíÚ¬î ÔåÆ ÕåÖÕø× localStorage + µø┤µû░ state"ÒÇé

/** Õ«ëÕà¿Þ»╗ localStorage */
function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

/** AI Õø×Õñìµïªµê¬þÜäÚ╗ÿÞ«ñµ¡úÕêÖ´╝êµ»ÅÞíîõ©ÇµØí´╝îõ╗╗µäÅÕæ¢õ©¡Õì│µïªµê¬´╝ë */
const DEFAULT_AI_INTERCEPT_PATTERNS = [
  '^<\\s*´¢£´¢£DSML´¢£´¢£',
  '<\\s*(?:[\\w-]+:)?invoke\\s+name=',
  '<\\s*\\/\\s*(?:[\\w-]+:)?invoke\\s*>',
  '<\\s*(?:[\\w-]+:)?parameter\\s+name=',
].join('\n');
/** AI Õø×Õñìµïªµê¬þÜäÚ╗ÿÞ«ñµÅÉþñ║Þ»¡ */
const DEFAULT_AI_INTERCEPT_PROMPT = 'Þ»Àõ¢┐þö¿ cuckoo õ╗úþáüÕØùÞ┐øÞíîÕÀÑÕàÀÞ░âþö¿´╝îõ©ìÞªüõ¢┐þö¿ XML invoke µá╝Õ╝ÅÒÇé';

/** Þ«¥þ¢«µò░µì«´╝êUI Õìòõ¢ì´╝ÜµùÂÚù┤þ▒╗õ©║"þºÆ"´╝øcount õ©║µò┤µò░´╝øprompt õ©║µûçµ£¼´╝ë */
interface SettingsData {
  retryEnabled: boolean;
  retryDelayMin: number;
  retryDelayMax: number;
  retryCount: number;
  retry429Delay: number;
  retry429Count: number;
  retryPrompt: string;
  xhrIdleTimeout: number;
  watchdogPrompt: string;
  watchdogCount: number;
  sendDelayMin: number;
  sendDelayMax: number;
  attachDelayMin: number;
  attachDelayMax: number;
  goalMaxIterations: number;
  /** µïÆþ╗Ø webFetch Þ«┐Úù«Õåàþ¢æ/õ┐ØþòÖÕ£░ÕØÇ´╝êÚ╗ÿÞ«ñÕà│Úù¡´╝ë */
  ssrfGuard: boolean;
  /** AI Õø×Õñìµïªµê¬þÜäµ¡úÕêÖ´╝êµ»ÅÞíîõ©ÇµØí´╝îõ╗╗µäÅÕæ¢õ©¡Õì│Þºåõ©║ XML ÕÀÑÕàÀÞ░âþö¿´╝ë */
  aiInterceptPatterns: string;
  /** µïªµê¬Õæ¢õ©¡ÕÉÄÕÅæþ╗Ö AI þÜäµÅÉþñ║Þ»¡ */
  aiInterceptPrompt: string;
}

/** Þ»╗ÕÅûÕ¢ôÕëìÞ«¥þ¢«´╝êUI Õìòõ¢ì´╝ÜþºÆ´╝ë */
function getSettingsData(): SettingsData {
  const sec = (raw: string | null, dft: number) => {
    const n = parseInt(raw || '', 10);
    return Number.isFinite(n) ? n / 1000 : dft;
  };
  const int = (raw: string | null, dft: number) => {
    const n = parseInt(raw || '', 10);
    return Number.isFinite(n) ? n : dft;
  };
  const enRaw = lsGet('cuckoo-retry-enabled');
  return {
    retryEnabled: enRaw === null ? true : enRaw === '1',
    retryDelayMin: sec(lsGet('cuckoo-retry-delay-min'), 4),
    retryDelayMax: sec(lsGet('cuckoo-retry-delay-max'), 10),
    retryCount: int(lsGet('cuckoo-retry-count'), 10),
    retry429Delay: sec(lsGet('cuckoo-retry-429-delay'), 120),
    retry429Count: int(lsGet('cuckoo-retry-429-count'), 40),
    retryPrompt: lsGet('cuckoo-retry-prompt') || 'ÕêÜµëìþÜäÕø×Õñìõ╝╝õ╣Äõ©¡µû¡õ║å´╝îÞ»ÀÚçìµû░Õ«îµò┤Õø×þ¡öõ©èõ©Çõ©¬Úù«ÚóÿÒÇé',
    xhrIdleTimeout: sec(lsGet('cuckoo-xhr-idle-timeout'), 300),
    watchdogPrompt: lsGet('cuckoo-watchdog-prompt') || 'Þ»Àþ╗ºþ╗¡',
    watchdogCount: int(lsGet('cuckoo-watchdog-count'), 3),
    sendDelayMin: sec(lsGet('cuckoo-send-delay-min'), 2),
    sendDelayMax: sec(lsGet('cuckoo-send-delay-max'), 4),
    attachDelayMin: sec(lsGet('cuckoo-attach-delay-min'), 0.5),
    attachDelayMax: sec(lsGet('cuckoo-attach-delay-max'), 1),
    goalMaxIterations: int(lsGet('cuckoo-goal-max-iterations'), 50),
    ssrfGuard: lsGet('cuckoo-ssrf-guard') === '1',
    aiInterceptPatterns: lsGet('cuckoo-ai-intercept-patterns') || DEFAULT_AI_INTERCEPT_PATTERNS,
    aiInterceptPrompt: lsGet('cuckoo-ai-intercept-prompt') || DEFAULT_AI_INTERCEPT_PROMPT,
  };
}

/**
 * µáíÚ¬îÕ╣ÂÕåÖÕø×Þ«¥þ¢«´╝êUI Õìòõ¢ì ÔåÆ Õ¡ÿÕé¿µ»½þºÆ´╝ëÒÇé
 * @returns { success, error? }
 */
function applySettingsData(data: any): { success: boolean; error?: string } {
  const secToMs = (s: any) => Math.round(parseFloat(s) * 1000);
  const dmin = secToMs(data && data.retryDelayMin);
  const dmax = secToMs(data && data.retryDelayMax);
  if (!Number.isFinite(dmin) || dmin < 0) return { success: false, error: 'µÖ«ÚÇÜÕñ▒Þ┤Ñµ£ÇÕ░ÅÚù┤ÚÜöÕ┐àÚí╗µÿ»ÚØ×Þ┤ƒµò░Õ¡ù' };
  if (!Number.isFinite(dmax) || dmax < dmin) return { success: false, error: 'µÖ«ÚÇÜÕñ▒Þ┤Ñµ£ÇÕñºÚù┤ÚÜöõ©ìÞâ¢Õ░Åõ║Äµ£ÇÕ░ÅÚù┤ÚÜö' };
  const cnt = parseInt(data && data.retryCount, 10);
  if (Number.isNaN(cnt)) return { success: false, error: 'µÖ«ÚÇÜÕñ▒Þ┤ÑÚçìÞ»òµ¼íµò░Õ┐àÚí╗µÿ»µò┤µò░' };
  const d429 = secToMs(data && data.retry429Delay);
  if (!Number.isFinite(d429) || d429 < 0) return { success: false, error: 'µôìõ¢£Úóæþ╣üÚçìÞ»òÚù┤ÚÜöÕ┐àÚí╗µÿ»ÚØ×Þ┤ƒµò░Õ¡ù' };
  const c429 = parseInt(data && data.retry429Count, 10);
  if (Number.isNaN(c429)) return { success: false, error: 'µôìõ¢£Úóæþ╣üÚçìÞ»òµ¼íµò░Õ┐àÚí╗µÿ»µò┤µò░' };
  const prompt = String((data && data.retryPrompt) || '').trim();
  if (!prompt) return { success: false, error: 'ÚçìÞ»òµÅÉþñ║Þ»ìõ©ìÞâ¢õ©║þ®║' };
  const idleTimeout = secToMs(data && data.xhrIdleTimeout);
  if (!Number.isFinite(idleTimeout) || idleTimeout < 0) return { success: false, error: 'AI Õø×ÕñìÞÂàµùÂÕ┐àÚí╗µÿ»ÚØ×Þ┤ƒµò░Õ¡ù' };
  const watchdogPrompt = String((data && data.watchdogPrompt) || '').trim();
  if (!watchdogPrompt) return { success: false, error: 'ÞÂàµùÂÚçìÞ»òµÅÉþñ║Þ»ìõ©ìÞâ¢õ©║þ®║' };
  const watchdogCount = parseInt(data && data.watchdogCount, 10);
  if (Number.isNaN(watchdogCount)) return { success: false, error: 'ÞÂàµùÂÚçìÞ»òµ¼íµò░Õ┐àÚí╗µÿ»µò┤µò░' };
  const smin = secToMs(data && data.sendDelayMin);
  const smax = secToMs(data && data.sendDelayMax);
  if (!Number.isFinite(smin) || smin < 0) return { success: false, error: 'ÕÅæÚÇüÕ╗ÂÞ┐ƒµ£ÇÕ░ÅÕÇ╝Õ┐àÚí╗µÿ»ÚØ×Þ┤ƒµò░Õ¡ù' };
  if (!Number.isFinite(smax) || smax < smin) return { success: false, error: 'ÕÅæÚÇüÕ╗ÂÞ┐ƒµ£ÇÕñºÕÇ╝õ©ìÞâ¢Õ░Åõ║Äµ£ÇÕ░ÅÕÇ╝' };
  const amin = secToMs(data && data.attachDelayMin);
  const amax = secToMs(data && data.attachDelayMax);
  if (!Number.isFinite(amin) || amin < 0) return { success: false, error: 'ÚÖäõ╗Âõ©èõ╝áÚù┤ÚÜöµ£ÇÕ░ÅÕÇ╝Õ┐àÚí╗µÿ»ÚØ×Þ┤ƒµò░Õ¡ù' };
  if (!Number.isFinite(amax) || amax < amin) return { success: false, error: 'ÚÖäõ╗Âõ©èõ╝áÚù┤ÚÜöµ£ÇÕñºÕÇ╝õ©ìÞâ¢Õ░Åõ║Äµ£ÇÕ░ÅÕÇ╝' };
  if (amax > 60000) return { success: false, error: 'ÚÖäõ╗Âõ©èõ╝áÚù┤ÚÜöµ£ÇÕñºÕÇ╝õ©ìÞâ¢ÞÂàÞ┐ç 60 þºÆ' };
  // þø«µáçµ£ÇÕñºÞ┐¡õ╗úµ¼íµò░´╝ÜÕ▒×"þ║»ÕçÇµ¿íÕ╝Å´╝êharness´╝ë"Þç¬Þ║½Þ«¥þ¢«´╝êharness ÚíÁµ£ëþï¼þ½ïÕàÑÕÅú´╝ëÒÇé
  // Õú│ÚíÁÚØóÞ«¥þ¢«ÚíÁõ©ìµÅÉõ¥øµ¡ñÕ¡ùµ«Á ÔåÆ õ╗àÕ£¿µÿ¥Õ╝ÅµÅÉõ¥øµùÂµëìµáíÚ¬î´╝îþ╝║Õñ▒µùÂõ┐ØþòÖÕÄƒÕÇ╝´╝êõ©ìµ©àþ®║ÒÇüõ©ìµèÑÚöÖ´╝ëÒÇé
  let goalMax: number | null = null;
  if (data && data.goalMaxIterations !== undefined && data.goalMaxIterations !== null && data.goalMaxIterations !== '') {
    goalMax = parseInt(data.goalMaxIterations, 10);
    if (Number.isNaN(goalMax) || goalMax <= 0) return { success: false, error: 'þø«µáçµ£ÇÕñºÞ┐¡õ╗úµ¼íµò░Õ┐àÚí╗µÿ»µ¡úµò┤µò░' };
  }
  // AI Õø×Õñìµïªµê¬µ¡úÕêÖ´╝Üµ»ÅµØíÚâ¢Õ┐àÚí╗µÿ»ÕÉêµ│òµ¡úÕêÖ´╝êµÅÉÕëìµáíÚ¬î´╝îÚü┐ÕàìÞ┐ÉÞíîµùÂµèøÚöÖ´╝ë
  if (data && data.aiInterceptPatterns !== undefined) {
    const lines = String(data.aiInterceptPatterns || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
    for (const line of lines) {
      try { new RegExp(line, 'i'); } catch (e: any) {
        return { success: false, error: 'AI µïªµê¬µ¡úÕêÖÚØ×µ│ò´╝Ü' + line + '´╝ê' + e.message + '´╝ë' };
      }
    }
  }

  try {
    localStorage.setItem('cuckoo-retry-enabled', (data && data.retryEnabled) ? '1' : '0');
    localStorage.setItem('cuckoo-retry-delay-min', String(dmin));
    localStorage.setItem('cuckoo-retry-delay-max', String(dmax));
    localStorage.setItem('cuckoo-retry-count', String(cnt));
    localStorage.setItem('cuckoo-retry-429-delay', String(d429));
    localStorage.setItem('cuckoo-retry-429-count', String(c429));
    localStorage.setItem('cuckoo-retry-prompt', prompt);
    localStorage.setItem('cuckoo-xhr-idle-timeout', String(idleTimeout));
    localStorage.setItem('cuckoo-watchdog-prompt', watchdogPrompt);
    localStorage.setItem('cuckoo-watchdog-count', String(watchdogCount));
    localStorage.setItem('cuckoo-send-delay-min', String(smin));
    localStorage.setItem('cuckoo-send-delay-max', String(smax));
    localStorage.setItem('cuckoo-attach-delay-min', String(amin));
    localStorage.setItem('cuckoo-attach-delay-max', String(amax));
    if (goalMax !== null) localStorage.setItem('cuckoo-goal-max-iterations', String(goalMax));
    // ssrfGuard õ╗àÕ¢ôµÿ¥Õ╝ÅµÅÉõ¥øµùÂµëìÕåÖ´╝êÚü┐Õàìµ£¬õ╝áÞ»ÑÕ¡ùµ«ÁþÜäÞ░âþö¿µû╣µèèÕ«âµ©àµêÉ 0´╝ë
    if (data && data.ssrfGuard !== undefined) localStorage.setItem('cuckoo-ssrf-guard', data.ssrfGuard ? '1' : '0');
    // AI Õø×Õñìµïªµê¬ÞºäÕêÖ´╝ÜÕÅ¬ÕåÖÚØ×þ®║Õ¡ùµ«Á´╝êõ┐ØþòÖþ®║ÕêùÞí¿þÜäÞ»¡õ╣ëÔÇöÔÇöþ®║ = õ©ìµïªµê¬´╝ë
    if (data && data.aiInterceptPatterns !== undefined) localStorage.setItem('cuckoo-ai-intercept-patterns', String(data.aiInterceptPatterns || ''));
    if (data && data.aiInterceptPrompt !== undefined) localStorage.setItem('cuckoo-ai-intercept-prompt', String(data.aiInterceptPrompt || ''));
  } catch (err: any) {
    return { success: false, error: 'ÕåÖÕàÑÕñ▒Þ┤Ñ: ' + err.message };
  }
  state.sendDelayMin = smin;
  state.sendDelayMax = smax;
  return { success: true };
}

/** µüóÕñìÚ╗ÿÞ«ñ´╝Üµ©à key + Úçìþ¢« state´╝îÞ┐öÕø×Ú╗ÿÞ«ñÕÇ╝ */
function resetSettingsData(): SettingsData {
  const KEYS = [
    'cuckoo-retry-enabled', 'cuckoo-retry-delay-min', 'cuckoo-retry-delay-max',
    'cuckoo-retry-count', 'cuckoo-retry-429-delay', 'cuckoo-retry-429-count',
    'cuckoo-retry-prompt', 'cuckoo-xhr-idle-timeout', 'cuckoo-watchdog-prompt',
    'cuckoo-watchdog-count', 'cuckoo-send-delay-min', 'cuckoo-send-delay-max',
    'cuckoo-attach-delay-min', 'cuckoo-attach-delay-max',
    'cuckoo-goal-max-iterations', 'cuckoo-ssrf-guard',
    'cuckoo-ai-intercept-patterns', 'cuckoo-ai-intercept-prompt',
  ];
  try { for (const k of KEYS) localStorage.removeItem(k); } catch (_) {}
  state.sendDelayMin = 2000;
  state.sendDelayMax = 4000;
  return getSettingsData();
}

export { openSettings, closeSettings, resetSettings, saveSettings, getSettingsData, applySettingsData, resetSettingsData };
export type { SettingsData };
