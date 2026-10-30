/**
 * DeepSeek µïªµê¬µ¿íÕ╝Åõ©ïþÜäÕø×ÕñìÕñäþÉåÕÖ¿´╝êÚÜöþª╗õ©ûþòî´╝ë
 * þøæÕÉ¼õ©╗õ©ûþòîµ│¿ÕàÑþÜä 'cuckoo-ai-response' õ║ïõ╗Â´╝îµöÂÕê░Õ«îµò┤Õø×ÕñìÕÉÄÞÁ░õ©Ä DOM µ¿íÕ╝Å
 * þø©ÕÉîþÜäÕÀÑÕàÀÞ░âþö¿/JS õ╗úþáüÕØùÕñäþÉåµÁüþ¿ïÒÇé
 */
import { extractJsToolBlocks, BT } from '../parser/js-detector.js';
import { looksLikeJsonToolCall } from '../parser/json-detector.js';
import { handleJsToolScript } from '../loop/executor.js';
import { sendCombinedJsResultsToChat, sendMessageToChat, cancelPendingSend, takePendingSendText, getLastToolResultText } from '../../overlay/chat-input.js';
import { showToolMask, hideToolMask } from '../../overlay/panel.js';
import * as watchdog from '../loop/watchdog.js';

// µ¡úµûçµáçÞ«░´╝ÜAI Õø×ÕñìÚçîÞ¥ôÕç║ [Þ«░Õ┐å]xxx´╝îÞ¢»õ╗Âµì«µ¡ñÞç¬Õè¿ÕêøÕ╗║
// õ©¡µûçÕà¿ÞºÆ/ÕìèÞºÆµû╣µï¼ÕÅÀÚâ¢µö»µîüÒÇéµáçÞ«░µ£¼Þ║½õ╝ÜþòÖÕ£¿ AI ÚíÁÚØóþÜäÕ»╣Þ»Øµ¡úµûçÚçî´╝êµùáµ│òÚÜÉÞùÅ´╝ëÒÇé
// ÕÅ¬Õî╣ÚàìÞíîÚªû´╝êÕÅ»ÕÉ½ÕëìÕ»╝þ®║þÖ¢´╝ëþÜäµáçÞ«░´╝îÚü┐ÕàìÞ»»õ╝ñµ¡úµûçõ©¡Õ╝òþö¿þÜä `[Þ«░Õ┐å]` Õ¡ùµáÀ
const MEMORY_MARKER_RE = /^[ \t]*[\[ÒÇÉ]Þ«░Õ┐å[\]ÒÇæ]\s*([^\n]+)/gm;

/**
 * õ╗Ä AI Õø×Õñìµ¡úµûçõ©¡µÅÉÕÅû [Þ«░Õ┐å] µáçÞ«░Õ╣ÂÞºªÕÅæõ©╗Þ┐øþ¿ïÕêøÕ╗║ÒÇé
 * Õñ▒Þ┤ÑÚØÖÚ╗ÿ´╝êõ©ìÕ¢▒Õôìõ©╗µÁüþ¿ï´╝ëÒÇéÞ┐öÕø×µÅÉÕÅûÕê░þÜäµò░ÚçÅÒÇé
 * µ│¿µäÅ´╝ÜµáçÞ«░ÞíîÕÀ▓þö▒ AI þ¢æÚíÁµ©▓µƒôÞ┐øÕ»╣Þ»Ø´╝îµ£¼Õç¢µò░ÕÅ¬Þ┤ƒÞ┤úµìòÞÄÀ´╝îõ©ìõ┐«µö╣µÿ¥þñ║ÒÇé
 */
async function processInlineMarkers(text: string): Promise<{ memories: number }> {
  const result = { memories: 0 };
  if (!text) return result;
  const api = (window as any).electronAPI;
  if (!api) return result;

  const memMatches = Array.from(text.matchAll(MEMORY_MARKER_RE));
  for (const m of memMatches) {
    const content = (m[1] || '').trim();
    if (!content) continue;
    try {
      if (api.createMemoryFromMarker) { await api.createMemoryFromMarker(content); result.memories++; }
    } catch (_) { /* ignore */ }
  }
  if (result.memories) {
    console.log('[Cuckoo Code][µáçÞ«░] Þ«░Õ┐å=' + result.memories);
  }
  return result;
}


const MAX_JS_RETRY = 3;
// Þ┐×þ╗¡"µá╝Õ╝ÅµÅÉþñ║"µ¼íµò░´╝êJSON/XML Õà▒þö¿´╝îÚÿ▓µ¡ó AI µØÑÕø×Õêçµìóµá╝Õ╝Åþ╗òÞ┐çõ©èÚÖÉ´╝ë
let formatHintCount = 0;
const FORMAT_HINT_MAX = 10;

/** AI Õø×Õñìµïªµê¬þÜäÚ╗ÿÞ«ñµ¡úÕêÖ´╝êÕÆî settings.ts þÜä DEFAULT_AI_INTERCEPT_PATTERNS õ©ÇÞç┤´╝ë */
const DEFAULT_AI_INTERCEPT_PATTERNS = [
  '^<\\s*´¢£´¢£DSML´¢£´¢£',
  '<\\s*(?:[\\w-]+:)?invoke\\s+name=',
  '<\\s*\\/\\s*(?:[\\w-]+:)?invoke\\s*>',
  '<\\s*(?:[\\w-]+:)?parameter\\s+name=',
].join('\n');
/** AI Õø×Õñìµïªµê¬þÜäÚ╗ÿÞ«ñµÅÉþñ║Þ»¡ */
const DEFAULT_AI_INTERCEPT_PROMPT = 'Þ»Àõ¢┐þö¿ cuckoo õ╗úþáüÕØùÞ┐øÞíîÕÀÑÕàÀÞ░âþö¿´╝îõ©ìÞªüõ¢┐þö¿ XML invoke µá╝Õ╝ÅÒÇé';

/** Þ»╗ÕÅûþö¿µêÀÚàìþ¢«þÜäµïªµê¬µ¡úÕêÖÕêùÞí¿´╝êÕÀ▓þ╝ûÞ»æ´╝ëÒÇéþ®║ÕêùÞí¿ = õ©ìµïªµê¬ÒÇé */
function getAiInterceptRegexes(): RegExp[] {
  let raw = '';
  try { raw = localStorage.getItem('cuckoo-ai-intercept-patterns') || ''; } catch (_) { /* ignore */ }
  const source = raw.trim() ? raw : DEFAULT_AI_INTERCEPT_PATTERNS;
  const out: RegExp[] = [];
  for (const line of source.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { out.push(new RegExp(s, 'i')); } catch (_) { /* ÚØ×µ│òµ¡úÕêÖÞÀ│Þ┐ç´╝êsettings õ┐ØÕ¡ÿµùÂÕÀ▓µáíÚ¬î´╝ë */ }
  }
  return out;
}

/** Þ»╗ÕÅûþö¿µêÀÚàìþ¢«þÜäµïªµê¬µÅÉþñ║Þ»¡ÒÇé */
function getAiInterceptPrompt(): string {
  try {
    const v = localStorage.getItem('cuckoo-ai-intercept-prompt');
    if (v !== null) return v;
  } catch (_) { /* ignore */ }
  return DEFAULT_AI_INTERCEPT_PROMPT;
}
// õ©èµ¼íÕÀ▓ÕñäþÉåþÜäµûçµ£¼´╝êÕÄ╗Úçì´╝îÚÿ▓ÕÉîõ©ÇµØíÕø×ÕñìÚçìÕñìÕñäþÉå´╝ë
let lastProcessedText = '';
// µ£ÇÞ┐æõ©Çµ¼íµïªµê¬Õê░þÜäÕ«îµò┤Õø×Õñìµûçµ£¼´╝êõ¥øµëïÕè¿Þºúµ×ÉÕñìþö¿´╝îõ©ìõ¥ØÞÁû DOM´╝ë
let lastInterceptedText = '';
// [õ©┤µùÂÞ»èµû¡] µ£ÇÞ┐æõ©Çµ¼íÕø×ÕñìþÜä dbg´╝êÕÉ½ hook þÜä opLog´╝ë
let lastRespDbg: any = null;
// þö¿µêÀÞ»Àµ▒éõ©¡µ¡ó´╝ÜÕü£µ¡óÕÀÑÕàÀÕ¥¬þÄ»þÜäÕø×õ╝á´╝êÕü£µ¡óµîëÚÆ«ÞºªÕÅæ´╝ë
let abortRequested = false;
function requestAbort(): void { abortRequested = true; }
function clearAbort(): void { abortRequested = false; }

function looksLikeIncompleteCodeError(error: any): boolean {
  if (!error || typeof error !== 'string') return false;
  return /SyntaxError|Missing initializer|Unexpected end of input|Unexpected token|Unexpected identifier|Unexpected reserved word|Invalid or unexpected token/i.test(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * µëºÞíî JS õ╗úþáüÕØù´╝îÚüçÕê░"õ╗úþáüõ©ìÕ«îµò┤"ÚöÖÞ»»µùÂÞç¬Õè¿ÚçìÞ»òÒÇé
 * µïªµê¬µ¿íÕ╝Åõ©ïµûçµ£¼ÕÀ▓Õ«îµò┤´╝êfinished´╝ë´╝îµùáÚ£ÇÚçìµû░µÅÉÕÅû´╝îþ«ÇÕìòÚçìÞ»òµëºÞíîÕì│ÕÅ»ÒÇé
 * @param shouldCancel ÕÅûµÂêÕêñÕ«Ü´╝øÞ┐öÕø× true µùÂÕü£µ¡óµëºÞíîÕÉÄþ╗¡õ╗úþáüÕØù´╝êÕÀ▓Þ┐øÕàÑµëºÞíîþÜäÕØùõ©ìõ©¡µû¡´╝ë
 * @returns ÕÀ▓µëºÞíîÕØùþÜäþ╗ôµ×£´╝êÕÅûµÂêµùÂõ©║ÕÀ▓Õ«îµêÉþÜäÚéúõ║øÕØù´╝ë
 */
async function executeJsBlocksWithRetry(blocks: string[], shouldCancel?: () => boolean): Promise<any[]> {
  // ÕÀÑÕàÀÕ╝ÇÕºï´╝êµ»Åõ©¬õ╗úþáüÕØùõ©Çµ¼í´╝ë
  for (const code of blocks) emitToolCall({ phase: 'start', code });
  let results: any[] = [];
  for (let attempt = 0; attempt <= MAX_JS_RETRY; attempt++) {
    results = [];
    for (const code of blocks) {
      // þö¿µêÀÕÀ▓ÕÅûµÂê´╝Üõ©ìÕåìµëºÞíîÕÉÄþ╗¡õ╗úþáüÕØù´╝îõ╗àõ┐ØþòÖÕÀ▓µëºÞíîÕØùþÜäþ╗ôµ×£
      if (shouldCancel && shouldCancel()) break;
      const r = await handleJsToolScript(code);
      if (r) results.push(r);
    }
    if (shouldCancel && shouldCancel()) break;
    const hasIncompleteFailure = results.some(
      (item) => item && item.result && !item.result.success && looksLikeIncompleteCodeError(item.result.error)
    );
    if (!hasIncompleteFailure) break;
    if (attempt < MAX_JS_RETRY) await sleep(1000);
  }
  // ÕÀÑÕàÀþ╗ôµØƒ´╝êÚÇÉÕØùõ©èµèÑþ╗ôµ×£´╝ë
  for (const r of results) {
    emitToolCall({
      phase: 'end',
      code: (r && r.code) || '',
      success: !!(r && r.result && r.result.success),
      output: (r && r.result && r.result.output) || '',
      error: (r && r.result && r.result.error) || '',
    });
  }
  return results;
}

/**
 * ÕñäþÉåõ©ÇµØíÕÀ▓Õ«îµêÉþÜä AI Õø×Õñìµûçµ£¼
 * @param text Õ«îµò┤Õø×Õñìµûçµ£¼´╝êMarkdown ÕÄƒµûç´╝ë
 * @param force õ©║ true µùÂÞÀ│Þ┐çÕÄ╗Úçì´╝êµëïÕè¿Þºúµ×ÉÚçìµû░µëºÞíîÕÉîõ©ÇµØíµùÂõ¢┐þö¿´╝ë
 */
async function processInterceptedResponse(text: string, force?: boolean): Promise<void> {
  if (abortRequested) { abortRequested = false; console.log('[Cuckoo Code][µïªµê¬] ÕÀ▓Þ»Àµ▒éõ©¡µ¡ó´╝îÞÀ│Þ┐çµ£¼µ¼íÕñäþÉå'); return; }
  const raw = (text || '').trim();
  if (!raw) return;
  if (!force && raw === lastProcessedText) return;
  lastProcessedText = raw;

  console.log('[Cuckoo Code][µïªµê¬] µöÂÕê░Õ«îµò┤Õø×Õñì´╝îÚò┐Õ║ª=' + raw.length + '´╝îÕ╝ÇÕºïÞºúµ×ÉÕÀÑÕàÀÞ░âþö¿');

  // 0. µ¡úµûçµáçÞ«░´╝Ü[Þ«░Õ┐å]xxx´╝êþï¼þ½ïõ║ÄÕÀÑÕàÀÞ░âþö¿´╝îµùáÞ«║ÕÉÄþ╗¡ÞÁ░Õô¬µØíÞÀ»Úâ¢ÕàêÕñäþÉå´╝ë
  try { await processInlineMarkers(raw); } catch (_) { /* ignore */ }

  // 1. õ╝ÿÕàêµúÇµÁï JS ÕÀÑÕàÀõ╗úþáüÕØù´╝êcuckoo / js õ╗úþáüÕØù´╝ë
  const jsBlocks = extractJsToolBlocks(raw);
  // [õ©┤µùÂÞ»èµû¡] Õ«Üõ¢ìÒÇîµ£ëÕØùÕì┤Þ»åÕê½õ©ìÕê░ÒÇìÔÇöÔÇöÕñ▒Þ┤ÑµùÂÞÉ¢þøÿÕà¿µûç
  try {
    const BT3 = BT + BT + BT;
    const fenceCount = raw.split(BT3).length - 1;
    const hasCuckooWord = raw.indexOf('cuckoo') >= 0;
    const fenceLangs = raw.split(String.fromCharCode(10)).map(function (l) { return l.trim(); }).filter(function (l) { return l.indexOf(BT3) === 0; }).map(function (l) { return l.slice(3).trim().split(' ')[0]; }).slice(0, 10);
    console.log('[Cuckoo Code][Þ»èµû¡] ÕÄƒµûçþë╣Õ¥ü: Úò┐Õ║ª=' + raw.length + ' Õø┤µáÅþ¼ªÕÅÀµò░=' + fenceCount + ' ÕÉ½cuckooÕ¡ù=' + hasCuckooWord + ' Õø┤µáÅÞ»¡Þ¿Ç=' + JSON.stringify(fenceLangs) + ' µÅÉÕÅûÕØùµò░=' + jsBlocks.length);
    // µ£ë cuckoo Õ¡ùõ¢åµÅÉÕÅû 0 ÕØù ÔåÆ µëôÕà¿µûçõ¥øÕêåµ×É´╝êþö¿ÕêåÚÜöµáçÞ«░ÕîàÞú╣´╝îõ¥┐õ║ÄµùÑÕ┐ùµÅÉÕÅû´╝ë
    if (hasCuckooWord && jsBlocks.length === 0) {
      console.log('[Cuckoo Code][Þ»èµû¡] µÅÉÕÅûÕñ▒Þ┤ÑÕà¿µûç >>>' + raw + '<<< Õà¿µûçþ╗ôµØƒ');
      try { console.log('[Cuckoo Code][Þ»èµû¡] opLog=' + JSON.stringify(lastRespDbg && lastRespDbg.opLog)); } catch (_) {}
    }
  } catch (e) { /* ignore */ }
  if (jsBlocks.length > 0) {
    console.log('[Cuckoo Code][µïªµê¬] µúÇµÁïÕê░ JS ÕÀÑÕàÀõ╗úþáüÕØù´╝ê' + jsBlocks.length + ' õ©¬´╝ë´╝îÕ╝ÇÕºïµëºÞíî');
    formatHintCount = 0;
    // õ╗ÄµúÇµÁïÕê░ÕÀÑÕàÀÞ░âþö¿Õê░þ╗ôµ×£ÕÅæÚÇüÕ«îµêÉ´╝îÕà¿þ¿ïÚü«þøûÚíÁÚØó´╝îþªüµ¡óþö¿µêÀÚóØÕñûµôìõ¢£´╝ø
    // ÕÀÑÕàÀµëºÞíîµ£ƒÚù┤ÕÉîµáÀµÿ¥þñ║ÒÇîÕü£µ¡óÒÇìµîëÚÆ«´╝îþé╣Õç╗ÕÅ»ÕÅûµÂê´╝êÚò┐õ╗╗ÕèíÕÅ»õ©¡µ¡ó´╝ë
    let cancelled = false;
    const onCancel = () => {
      cancelled = true;
      cancelPendingSend();
      hideToolMask();
    };
    showToolMask(onCancel);
    let results: any[] = [];
    try {
      results = await executeJsBlocksWithRetry(jsBlocks, () => cancelled);
    } catch (err) {
      hideToolMask();
      throw err;
    }
    // þö¿µêÀÕÀ▓ÕÅûµÂê´╝Üõ©óÕ╝âµëºÞíîþ╗ôµ×£´╝îõ©ìÕåìÕø×õ╝á
    if (cancelled) {
      hideToolMask();
      return;
    }
    if (results.length === 0) {
      hideToolMask();
      return;
    }
    // þ¡ëÕ¥àÕÅæÚÇüÚÿÂµ«Á´╝ÜÚü«þ¢®õ┐ØµîüÒÇîÕü£µ¡óÒÇìµîëÚÆ«´╝êonCancel Õñìþö¿´╝ë´╝îþé╣Õç╗ÕÅ»ÕÅûµÂêÕø×õ╝á
    showToolMask(onCancel);
    if (abortRequested) { abortRequested = false; hideToolMask(); console.log('[Cuckoo Code][µïªµê¬] ÕÀ▓Þ»Àµ▒éõ©¡µ¡ó´╝îõ©ìÕø×õ╝áÕÀÑÕàÀþ╗ôµ×£'); return; }
    // afterSent Õ£¿"þ╗ôµ×£ÕÀ▓ÕÅæÕç║"µùÂÞºªÕÅæÚÜÉÞùÅ´╝øÕÅæÚÇüÕñ▒Þ┤Ñ´╝êµë¥õ©ìÕê░Þ¥ôÕàÑµíåþ¡ë´╝ëÕêÖþ½ïÕì│ÚÜÉÞùÅÕà£Õ║ò
    const sent = await sendCombinedJsResultsToChat(results, hideToolMask);
    if (cancelled) return; // þö¿µêÀÕÀ▓ÕÅûµÂê´╝îõ©ìÕåìÕñäþÉå
    if (!sent) hideToolMask();
    return;
  }

  // 2. JSON µá╝Õ╝ÅÕÀÑÕàÀÞ░âþö¿´╝êD11´╝ÜÕÀ▓Õ║ƒÚÖñµëºÞíî´╝îõ╗àÞ»åÕê½Õ╣ÂµÅÉþñ║µö╣þö¿ cuckoo õ╗úþáüÕØù´╝ë
  if (looksLikeJsonToolCall(raw)) {
    if (formatHintCount >= FORMAT_HINT_MAX) {
      console.log('[Cuckoo Code][µïªµê¬] ÕÀ▓Þ┐×þ╗¡µÅÉþñ║ ' + formatHintCount + ' µ¼íµá╝Õ╝ÅÚù«Úóÿ´╝îÕü£µ¡óÕÅæÚÇü');
      return;
    }
    formatHintCount++;
    console.log('[Cuckoo Code][µïªµê¬] µúÇµÁïÕê░ JSON µá╝Õ╝ÅÕÀÑÕàÀÞ░âþö¿´╝êþ¼¼ ' + formatHintCount + ' µ¼íµÅÉþñ║´╝ë');
    sendMessageToChat(
      'Þ»Àõ¢┐þö¿' + BT + BT + BT + 'cuckoo' + BT + BT + BT + ' õ╗úþáüÕØùÞ┐øÞíîÕÀÑÕàÀÞ░âþö¿´╝îõ©ìÞªüÞ¥ôÕç║ JSON µá╝Õ╝ÅÒÇé',
      'JSONÕÀÑÕàÀÞ░âþö¿µÅÉþñ║'
    );
    return;
  }

  // 3. AI Õø×Õñìµïªµê¬´╝êþö¿µêÀÕÅ»Úàìþ¢«µ¡úÕêÖ´╝îõ╗╗µäÅÕæ¢õ©¡Õì│µÅÉþñ║ AI µö╣µá╝Õ╝Å´╝ë
  const interceptRegexes = getAiInterceptRegexes();
  if (interceptRegexes.some((re) => re.test(raw))) {
    if (formatHintCount >= FORMAT_HINT_MAX) {
      console.log('[Cuckoo Code][µïªµê¬] ÕÀ▓Þ┐×þ╗¡µÅÉþñ║ ' + formatHintCount + ' µ¼íµá╝Õ╝ÅÚù«Úóÿ´╝îÕü£µ¡óÕÅæÚÇü');
      return;
    }
    formatHintCount++;
    console.log('[Cuckoo Code][µïªµê¬] Õæ¢õ©¡ AI Õø×Õñìµïªµê¬ÞºäÕêÖ´╝êþ¼¼ ' + formatHintCount + ' µ¼íµÅÉþñ║´╝ë');
    sendMessageToChat(getAiInterceptPrompt(), 'AIÕø×Õñìµïªµê¬µÅÉþñ║');
    return;
  }

  // 4. µÖ«ÚÇÜµûçµ£¼Õø×Õñì´╝Üõ╗╗ÕèíÕ«îµêÉ´╝îÚÇÇÕç║ÕÀÑÕàÀÕ¥¬þÄ»
  console.log('[Cuckoo Code][µïªµê¬] µ¡úÕ©©µûçµ£¼Õø×Õñì´╝îµ£¬µúÇµÁïÕê░ÕÀÑÕàÀÞ░âþö¿');
  try {
    (window as any).electronAPI.showAiNotification().catch(() => {});
  } catch (e) { /* ignore */ }
  // õ╗╗Õèíþ®║Úù▓õ┐íÕÅÀ´╝êÕÀÑÕàÀÕ¥¬þÄ»þ╗ôµØƒ = AI þ╗ÖÕç║µÖ«ÚÇÜµûçµ£¼Õø×Õñì´╝ëÔÇöÔÇöõ¥øÞç¬Õè¿ÕÄïþ╝®þ¡ë"õ╗╗ÕèíÞ¥╣þòî"ÚÇ╗Þ¥æõ¢┐þö¿
  emitTaskIdle();
}

// µÁüÕ╝ÅÕó×ÚçÅþøæÕÉ¼ÕÖ¿´╝êõ¥øþ║»ÕçÇµ¿íÕ╝ÅÕ«×µùÂµ©▓µƒô´╝øµùáþøæÕÉ¼ÞÇàµùÂÚøÂÕ╝ÇÚöÇ´╝ë
const streamListeners = new Set<(ev: any) => void>();

/** µ│¿Õåî"µÁüÕ╝ÅÕó×ÚçÅ"þøæÕÉ¼ÕÖ¿´╝ê{ think, text, finished }´╝ë */
function onStream(cb: (ev: any) => void): () => void {
  streamListeners.add(cb);
  return () => streamListeners.delete(cb);
}

/** µ┤¥ÕÅæµÁüÕ╝ÅÕó×ÚçÅ´╝êµùáþøæÕÉ¼ÞÇàµùÂþø┤µÄÑÞ┐öÕø×´╝ë */
function emitStream(ev: any): void {
  if (streamListeners.size === 0) return;
  for (const cb of streamListeners) {
    try { cb(ev); } catch (_) { /* ignore */ }
  }
}

// õ╗╗Õèíþ®║Úù▓þøæÕÉ¼ÕÖ¿´╝êÕÀÑÕàÀÕ¥¬þÄ»þ╗ôµØƒ´╝ÜAI þ╗ÖÕç║µÖ«ÚÇÜµûçµ£¼Õø×ÕñìµùÂµ┤¥ÕÅæ´╝øµùáþøæÕÉ¼ÞÇàµùÂÚøÂÕ╝ÇÚöÇ´╝ë
const taskIdleListeners = new Set<() => void>();

/** µ│¿Õåî"õ╗╗Õèíþ®║Úù▓"þøæÕÉ¼ÕÖ¿´╝êÕÀÑÕàÀÕ¥¬þÄ»þ╗ôµØƒ´╝ë */
function onTaskIdle(cb: () => void): () => void {
  taskIdleListeners.add(cb);
  return () => taskIdleListeners.delete(cb);
}

/** µ┤¥ÕÅæ"õ╗╗Õèíþ®║Úù▓"´╝êµùáþøæÕÉ¼ÞÇàµùÂþø┤µÄÑÞ┐öÕø×´╝ë */
function emitTaskIdle(): void {
  if (taskIdleListeners.size === 0) return;
  for (const cb of taskIdleListeners) {
    try { cb(); } catch (_) { /* ignore */ }
  }
}

// ÕÀÑÕàÀÞ░âþö¿þøæÕÉ¼ÕÖ¿´╝êõ¥øþ║»ÕçÇµ¿íÕ╝Åþ¡ëõ©èµèÑÕÀÑÕàÀÕ╝ÇÕºï/þ╗ôµØƒ´╝øµùáþøæÕÉ¼ÞÇàµùÂÚøÂÕ╝ÇÚöÇ´╝ë
const toolCallListeners = new Set<(ev: any) => void>();

/**
 * µ│¿Õåî"ÕÀÑÕàÀÞ░âþö¿"þøæÕÉ¼ÕÖ¿
 * @param cb ÕÀÑÕàÀÕ╝ÇÕºï/þ╗ôµØƒµùÂÞ░âþö¿´╝îÕÅéµò░ { phase: 'start'|'end', code, success?, output?, error? }
 * @returns ÕÅûµÂêµ│¿Õåî
 */
function onToolCall(cb: (ev: any) => void): () => void {
  toolCallListeners.add(cb);
  return () => toolCallListeners.delete(cb);
}

/** µ┤¥ÕÅæÕÀÑÕàÀÞ░âþö¿õ║ïõ╗Â´╝êµùáþøæÕÉ¼ÞÇàµùÂþø┤µÄÑÞ┐öÕø×´╝ë */
function emitToolCall(ev: any): void {
  if (toolCallListeners.size === 0) return;
  for (const cb of toolCallListeners) {
    try { cb(ev); } catch (_) { /* ignore */ }
  }
}

// Õø×ÕñìÕ«îµêÉþøæÕÉ¼ÕÖ¿´╝êõ¥øÕÄïþ╝®þ¡ëµÁüþ¿ïþ¡ëÕ¥à AI Õø×ÕñìÕ«îµêÉ´╝ë
// meta µÉ║Õ©ªµ£ìÕèíþ½»µØâÕ¿üµò░µì«´╝êtokenUsage / msgIds´╝ë´╝îþö▒þøæÕÉ¼µû╣µîëÚ£ÇÕÅûþö¿´╝î
// Úü┐ÕàìÕà▒õ║½þèÂµÇüÞÀ¿Õ▒é´╝êbridge õ©ìõ¥ØÞÁû overlay´╝ëÒÇé
const responseListeners = new Set<(text: string, meta: any) => void>();
// Õñ▒Þ┤ÑþøæÕÉ¼ÕÖ¿´╝êõ¥øÞç¬Õè¿ÚçìÞ»òÕ╝òµôÄÞ«óÚÿà´╝ë
const errorListeners = new Set<(detail: any) => void>();

/**
 * µ│¿Õåî"AI Õø×ÕñìÕ«îµêÉ"þøæÕÉ¼ÕÖ¿
 * @param cb µöÂÕê░Õ«îµêÉÕø×ÕñìµùÂÞ░âþö¿´╝îÕÅéµò░õ©║Õ«îµò┤µûçµ£¼ + meta´╝ê{ tokenUsage, msgIds }´╝ë
 * @returns ÕÅûµÂêµ│¿Õåî
 */
function onInterceptedResponse(cb: (text: string, meta: any) => void): () => void {
  responseListeners.add(cb);
  return () => responseListeners.delete(cb);
}

/**
 * µ│¿Õåî"AI Þ»Àµ▒éÕñ▒Þ┤Ñ"þøæÕÉ¼ÕÖ¿
 * @param cb µöÂÕê░Õñ▒Þ┤Ñõ║ïõ╗ÂµùÂÞ░âþö¿´╝îÕÅéµò░õ©║ detail { text, status, reason, httpStatus, name }
 * @returns ÕÅûµÂêµ│¿Õåî
 */
function onAiError(cb: (detail: any) => void): () => void {
  errorListeners.add(cb);
  return () => errorListeners.delete(cb);
}

/**
 * ÕÉ»Õè¿µïªµê¬õ║ïõ╗ÂþøæÕÉ¼
 */
function startInterceptObserver(): void {
  window.addEventListener('cuckoo-ai-response', (ev: any) => {
    try {
      const detail = ev && ev.detail;
      if (!detail) return;
      // Þ»èµû¡µùÑÕ┐ùÕÀ▓þº╗ÚÖñ´╝êÚ½ÿÚóæ JSON.stringify + µ»ÅÕø×ÕñìÞ¥ôÕç║´╝îõ╝ÜµïûµàóÚíÁÚØó/þ┤»þº»µùÑÕ┐ù´╝ë
      // þö¿µêÀõ©╗Õè¿Õü£µ¡ó´╝Üõ©ìÕñäþÉå´╝îõ╣ƒõ©ìÚÇÜþƒÑþøæÕÉ¼ÕÖ¿´╝êþ¡ëÕ¥àµû╣µîëÞÂàµùÂÕñäþÉå´╝ë
      if (detail.status === 'stopped') {
        console.log('[Cuckoo Code][µïªµê¬] µúÇµÁïÕê░þö¿µêÀÕü£µ¡óþöƒµêÉ´╝îÕ┐¢þòÑÞ»ÑÕø×Õñì');
        try { watchdog.onResponseReceived('stopped'); } catch (_) { /* ignore */ }
        return;
      }
      if (!detail.finished) return;
      try { watchdog.onResponseReceived('finished'); } catch (_) { /* ignore */ }
      // þ╝ôÕ¡ÿµ£ÇÞ┐æõ©Çµ¼íÕ«îµò┤Õø×Õñìµûçµ£¼´╝îõ¥øµëïÕè¿Þºúµ×ÉÕñìþö¿´╝êõ©ìõ¥ØÞÁû DOM´╝ë
      lastInterceptedText = detail.text || '';
      lastRespDbg = detail.dbg || null;
      // ÚÇÜþƒÑþøæÕÉ¼ÕÖ¿´╝êµ»Åµ¼íµêÉÕèƒÕø×ÕñìÚâ¢ÞºªÕÅæ´╝ë´╝îµÉ║Õ©ªµ£ìÕèíþ½»µØâÕ¿üµò░µì«
      const meta = { tokenUsage: detail.tokenUsage || null, msgIds: detail.msgIds || null };
      for (const cb of responseListeners) {
        try { cb(detail.text || '', meta); } catch (_) { /* ignore */ }
      }
      processInterceptedResponse(detail.text);
    } catch (err) {
      console.error('[Cuckoo Code][µïªµê¬] ÕñäþÉåÕø×Õñìõ║ïõ╗ÂÕç║ÚöÖ:', err);
    }
  });
  window.addEventListener('cuckoo-ai-stream', (ev: any) => {
    try {
      const detail = ev && ev.detail;
      if (!detail) return;
      emitStream({
        think: detail.think || '',
        text: detail.text || '',
        finished: !!detail.finished,
        // ÚÇÅõ╝áµ£ìÕèíþ½»µØâÕ¿ü token´╝êDeepSeek´╝ë´╝øþ╝║Õñ▒µùÂõ©║ undefined´╝îõ©ïµ©©Õø×ÚÇÇõ╝░þ«ù
        accumulatedTokens: typeof detail.accumulatedTokens === 'number' ? detail.accumulatedTokens : null,
      });
    } catch (_) { /* ignore */ }
  });
  // õ©èõ©ïµûçÞÇùÕ░¢´╝Ühook µúÇµÁïÕê░ banner_info.call_to_action ÕÉ½ continue_in_new_chat ÔåÆ Þ»Àµ▒éõ©╗Þ┐øþ¿ïÞç¬Õè¿þ╗¡µÄÑ
  window.addEventListener('cuckoo-context-exhausted', (ev: any) => {
    try {
      const detail = ev && ev.detail;
      console.log('[Cuckoo Code][µïªµê¬] õ©èõ©ïµûçÕÀ▓þö¿Õ«î´╝îÞ»Àµ▒éÞç¬Õè¿Õ£¿µû░õ╝ÜÞ»Øþ╗¡µÄÑ:', JSON.stringify(detail || {}));
      // µì×Õø×ÕÀÑÕàÀþ╗ôµ×£Õ©ªÕê░µû░õ╝ÜÞ»Ø´╝Ü
      //  1) õ╝ÿÕàêÒÇîÕêÜÕí½ÕàÑÒÇüµ£¬ÕÅèÕÅæÚÇüÒÇìþÜä´╝êÞÇùÕ░¢þ×¼Úù┤ÕìíÕ£¿ÕÅæÚÇüÕ╗ÂÞ┐ƒÚçî´╝ë
      //  2) ÕÉªÕêÖþö¿ÒÇîµ£ÇÞ┐æõ©ÇµØíÕÀ▓ÕÅæÕç║þÜäÕÀÑÕàÀþ╗ôµ×£ÒÇì´╝êÞÇùÕ░¢ÚÇÜÕ©©ÕÅæþöƒÕ£¿ AI Õø×ÕñìµÁüµ£½Õ░¥´╝îµ¡ñµùÂþ╗ôµ×£ÕÀ▓ÕÅæÕç║´╝î
      //     õ¢åµû░õ╝ÜÞ»Øõ©èõ©ïµûçÚçîµ▓íµ£ëÕ«â´╝îÚ£ÇÞªüÞíÑÕÅæÞ«® AI þƒÑÚüôµëºÞíîþ╗ôµ×£´╝ë
      let pendingText: string | null = null;
      try {
        cancelPendingSend();
        pendingText = takePendingSendText();
        if (pendingText) {
          console.log('[Cuckoo Code][µïªµê¬] µì×Õø×µ£¬ÕÅæÕç║þÜäÕÀÑÕàÀþ╗ôµ×£´╝îÚò┐Õ║ª=' + pendingText.length);
        } else {
          pendingText = getLastToolResultText() || null;
          if (pendingText) console.log('[Cuckoo Code][µïªµê¬] þö¿µ£ÇÞ┐æÕÀ▓ÕÅæÕç║þÜäÕÀÑÕàÀþ╗ôµ×£þ╗¡µÄÑ´╝îÚò┐Õ║ª=' + pendingText.length);
        }
      } catch (_) { /* ignore */ }
      const api = (window as any).electronAPI;
      if (api && typeof api.contextExhaustedContinue === 'function') {
        api.contextExhaustedContinue({ pendingText }).catch((err: any) => {
          console.error('[Cuckoo Code][µïªµê¬] õ©èõ©ïµûçþ╗¡µÄÑÞ»Àµ▒éÕñ▒Þ┤Ñ:', err && err.message);
        });
      }
    } catch (err) {
      console.error('[Cuckoo Code][µïªµê¬] ÕñäþÉåõ©èõ©ïµûçÞÇùÕ░¢õ║ïõ╗ÂÕç║ÚöÖ:', err);
    }
  });
  window.addEventListener('cuckoo-ai-error', (ev: any) => {
    try {
      const detail = ev && ev.detail;
      try { watchdog.onResponseReceived('error'); } catch (_) { /* ignore */ }
      for (const cb of errorListeners) {
        try { cb(detail || {}); } catch (_) { /* ignore */ }
      }
    } catch (err) {
      console.error('[Cuckoo Code][µïªµê¬] ÕñäþÉåÕñ▒Þ┤Ñõ║ïõ╗ÂÕç║ÚöÖ:', err);
    }
  });
  console.log('[Cuckoo Code][µïªµê¬] ÕÀ▓ÕÉ»Õè¿ cuckoo-ai-response / cuckoo-ai-error õ║ïõ╗ÂþøæÕÉ¼');
}

/** ÕÅûµ£ÇÞ┐æõ©Çµ¼íµïªµê¬Õê░þÜäÕ«îµò┤Õø×Õñìµûçµ£¼´╝êµëïÕè¿Þºúµ×Éþö¿´╝ë */
function getLastInterceptedText(): string {
  return lastInterceptedText;
}

export { startInterceptObserver, processInterceptedResponse, processInlineMarkers, getLastInterceptedText, onInterceptedResponse, onAiError, onToolCall, onStream, onTaskIdle, requestAbort, clearAbort };
