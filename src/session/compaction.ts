/**
 * ÕÄïþ╝®õ©èõ©ïµûç´╝Üµ©à IDB + ÕêÀµû░´╝îÞ«® DeepSeek Þç¬ÕÀ▒ÕåÖÕø×Õ«îµò┤ÕÄåÕÅ▓
 *
 * ÞâîµÖ»´╝êÕ«×µÁï´╝ë´╝ÜÕÉîõ╝ÜÞ»ØÕåà AI Õø×ÕñìÕÉÄ IDB õ©ìµø┤µû░´╝øÕêÀµû░ÚíÁÚØóµëìõ╝ÜÞíÑÚ¢É´╝ø
 * µ©à IDB ÕÉÄÕêÀµû░´╝îDeepSeek õ╝ÜÞç¬Õè¿Úçìµû░µïëÕÅûÕ«îµò┤ÕÄåÕÅ▓ÕåÖÕø×´╝êcache_control: REPLACE´╝ëÒÇé
 *
 * µÁüþ¿ï´╝Ü
 *  µ«Á1´╝êÕ¢ôÕëìÚíÁ runCompaction´╝ë´╝Ü
 *    ÕÅæµæÿÞªüµîçõ╗ñ ÔåÆ þ¡ëÕø×Õñì ÔåÆ µ©àÕ¢ôÕëìõ╝ÜÞ»Ø IDB Þ«░Õ¢ò ÔåÆ Õ¡ÿÚí╣þø«þø«Õ¢ò ÔåÆ URL ÕèáµáçÞ«░ ÔåÆ ÕêÀµû░
 *  µ«Á2´╝êÕêÀµû░ÕÉÄÕÉîÚíÁ checkPendingCompact´╝ë´╝Ü
 *    µúÇµÁï URL µáçÞ«░ ÔåÆ µ©àµáçÞ«░ ÔåÆ þ¡ë hook þÜä IDB ÕåÖÕàÑõ║ïõ╗Â ÔåÆ Þ»╗ IDB
 *    ÔåÆ ÕÅûµ£ÇÞ┐æ 20% µêÉÕ»╣ ÔåÆ share/create ÔåÆ Õ¡ÿ pending-init ÔåÆ ÞÀ│Õêåõ║½Úô¥µÄÑ
 *  µ«Á3´╝êÕêåõ║½ÚíÁ checkPendingInit´╝ë´╝Ü
 *    þÄ░µ£ëÚÇ╗Þ¥æ´╝Ü3 þºÆÕÉÄÞç¬Õè¿ÕêØÕºïÕîûÚí╣þø«
 *
 * õ¥ØÞÁû´╝Ü
 *  - hook ÕÀ▓þ╝ôÕ¡ÿþ£ƒÕ«×Þ»Àµ▒éÕñ┤Õê░ localStorage['cuckoo-ds-headers']
 *  - hook Õ£¿ URL Õ©ª cuckoo-compact µùÂÕîàÞúà IDBObjectStore.put´╝îÕåÖÕàÑµêÉÕèƒµ┤¥ÕÅæ
 *    'cuckoo-idb-history-written' õ║ïõ╗Â
 */
import { sendToChat } from '../overlay/chat-input.js';
import { onInterceptedResponse } from '../bridge/intercept/observer.js';
import { showToast } from '../overlay/panel.js';
import * as retryEngine from '../bridge/loop/retry.js';
import * as watchdog from '../bridge/loop/watchdog.js';

const SUMMARY_INSTRUCTION =
  'Þ»Àµèèõ╗Ñõ©èÕ»╣Þ»ØµÇ╗þ╗ôµêÉõ©Çõ╗¢Þ»ªþ╗åþÜäµæÿÞªü´╝îÕ░¢ÕÅ»Þâ¢Õ«îµò┤Õ£░õ┐ØþòÖÕà│Úö«õ┐íµü»ÒÇüÞâîµÖ»õ©èõ©ïµûçÒÇü' +
  'ÕÀ▓Õ«îµêÉþÜäþ╗ôÞ«║ÕÆîµ£¬Õ«îµêÉþÜäõ║ïÚí╣´╝îþö¿õ©¡µûç´╝îõ©Çµ¼íµÇºÞ¥ôÕç║Õà¿Úâ¿ÕåàÕ«╣´╝î' +
  'þø┤µÄÑÞ¥ôÕç║µæÿÞªü´╝îõ©ìÞªüÞ¥ôÕç║ÕàÂõ╗ûÞºúÚçèÒÇé';

// ÕÄïþ╝®õ║ñµÄÑµÅÉþñ║´╝ê2026-10-01´╝ë´╝ÜÕÄïþ╝®ÕÉÄµû░õ╝ÜÞ»ØÕÅ¬µ£ëµæÿÞªüõ©èõ©ïµûç´╝îAI õ╝Üþø▓þø«õ┐íõ╗╗Õ«âÒÇé
//   Þªüµ▒é AI õ©╗Õè¿Þ»╗µûçõ╗ÂÞíÑÕà¿Úí╣þø«/õ╗╗Õèíõ©èõ©ïµûç´╝îÚü┐ÕàìÕƒ║õ║Äµ«ïþ╝║µæÿÞªüÞíîÕè¿ÒÇéþö¿µêÀÞ»ëµ▒éÒÇé
const CONTEXT_HANDOFF_INSTRUCTION =
  'ÒÇÉõ©èõ©ïµûçõ║ñµÄÑµÅÉþñ║ÒÇæõ¢áÕ¢ôÕëìþ£ïÕê░þÜäÕ»╣Þ»Øµÿ»õ©èõ©ÇÞ¢«õ╝ÜÞ»Øþ╗ÅÕÄïþ╝®ÕÉÄþÜäµæÿÞªü´╝î**Õ╣ÂÚØ×Õ«îµò┤õ©èõ©ïµûç**ÔÇöÔÇö' +
  'µæÿÞªüÕÅ»Þâ¢õ©óÕñ▒þ╗åÞèéÒÇüÕüçÞ«¥ÒÇüµ£¬ÞÉ¢þøÿþÜäÕå│þ¡ûÒÇé**õ©ìÞªüþø▓þø«þø©õ┐íõ¢áÕ¢ôÕëìþÜäõ©èõ©ïµûçÒÇé**\n\n' +
  'Þ»Àþ½ïÕì│õ©╗Õè¿ÞíÑÕà¿õ©èõ©ïµûç´╝Ü\n' +
  '1. Þ»╗ÕÅûÚí╣þø«µûçµíú/õ╗úþáü´╝îõ║åÞºúÚí╣þø«þÄ░þèÂõ©ÄÞ┐øÞíîõ©¡þÜäõ╗╗Õèí´╝êÕªé specÒÇüREADMEÒÇüõ╗╗Õèíµ©àÕìòÒÇüµ£ÇÞ┐æµö╣Õè¿þÜäµûçõ╗Â´╝ë´╝ø\n' +
  '2. µá©Õ«×µæÿÞªüõ©¡þÜäÕà│Úö«þ╗ôÞ«║Õ£¿µûçõ╗Â/õ╗úþáüÚçîµÿ»ÕÉªþ£ƒÕ«×µêÉþ½ï´╝êõ©ìÞ¢╗õ┐íµæÿÞªü´╝ë´╝ø\n' +
  '3. µÿÄþí«Õ¢ôÕëìõ╗╗ÕèíÞ┐øÕ║ªõ©Äõ©ïõ©Çµ¡ÑÒÇé\n\n' +
  'ÞíÑÕà¿ÕÉÄ´╝îµ£ÇÕÉÄÕìòþï¼Þ¥ôÕç║õ©ÇÕÅÑ´╝Ü**õ©èõ©ïµûçõ║ñµÄÑÕÀ▓Õ«îµêÉ**ÒÇé';

const COMPACT_URL_FLAG = 'cuckoo-compact';
const COMPACT_DIR_KEY = 'cuckoo-compact-project-dir';
const PENDING_INIT_KEY = 'cuckoo-compact-pending-init';
const IDB_WAIT_TIMEOUT = 20000;

// þ¬ùÕÅúþ╗äÞ¢¼þº╗Õ»╣Þ»Ø´╝Üõ©ÄÕÄïþ╝®ÕÉîµ║É´╝êµ©à IDB + ÕêÀµû░ + þ¡ëÚçìÕåÖ´╝ë´╝îõ¢å ratio=1.0´╝êÕà¿ÚçÅ´╝ëÒÇüõ©ìÞÀ│Þ¢¼´╝êõ©╗Þ┐øþ¿ïÕ»╝Þê¬þø«µáçþ¬ùÕÅú´╝ë
const SWITCH_URL_FLAG = 'cuckoo-switch';
const SWITCH_ID_KEY = 'cuckoo-switch-id';

function logStep(step: string, msg: string): void {
  console.log('[Cuckoo Compact] [' + step + '] ' + msg);
}

/** Õ£¿ÚçìÞ»òÚù┤ÚÜöµ£ƒÚù┤Õ▒òþñ║ÕÇÆÞ«íµùÂ´╝êµ»ÅþºÆµø┤µû░õ©Çµ¼í toast´╝îÕÉ½Õñ▒Þ┤ÑÕÄƒÕøá´╝ë´╝îþ¡ëÕ¥àþ╗ôµØƒÕÉÄÞ┐öÕø×ÒÇé */
async function countdownAndWait(attempt: number, maxAttempts: number, intervalMs: number, reason: string): Promise<void> {
  const totalSec = Math.ceil(intervalMs / 1000);
  for (let remaining = totalSec; remaining > 0; remaining--) {
    showToast('ÕÄïþ╝®ÚçìÞ»òõ©¡´╝ê' + attempt + '/' + maxAttempts + '´╝ë´╝Ü' + remaining + ' þºÆÕÉÄÚçìµû░ÕêÀµû░ÔÇª\nÕÄƒÕøá: ' + reason, 2000);
    await new Promise<void>((r) => setTimeout(r, 1000));
  }
}

interface MessageItem {
  message_id: number;
  role: string;
  parent_id?: any;
}

/** þ¡ëÕ¥à AI Õø×ÕñìÕ«îµêÉ´╝êµïªµê¬Õê░Õ«îµò┤Õø×Õñì´╝ë */
function waitForResponse(timeoutMs: number): Promise<{ text: string; meta: any }> {
  return new Promise((resolve, reject) => {
    let done = false;
    const off = onInterceptedResponse((text: string, meta: any) => {
      if (done) return;
      done = true;
      off();
      clearTimeout(timer);
      resolve({ text, meta: meta || {} });
    });
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      off();
      reject(new Error('þ¡ëÕ¥à AI Õø×ÕñìÞÂàµùÂ´╝ê' + timeoutMs + 'ms´╝ë'));
    }, timeoutMs);
  });
}

/** õ╗ÄÕ¢ôÕëì URL ÞÄÀÕÅû chat_session_id */
function getSessionIdFromUrl(): string | null {
  const m = String(location.href).match(/\/chat\/s\/([a-f0-9-]+)/i);
  return m ? m[1] : null;
}

/** õ╗Ä localStorage Þ»╗ÕÅûþ╝ôÕ¡ÿþÜäþ£ƒÕ«×Þ»Àµ▒éÕñ┤ */
function getCachedHeaders(): any {
  try {
    const raw = localStorage.getItem('cuckoo-ds-headers');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/** µ©àµÄëÕ¢ôÕëìõ╝ÜÞ»ØÕ£¿ IDB þÜäÞ«░Õ¢ò */
function clearSessionFromIdb(sessionId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let req: any;
    try { req = indexedDB.open('deepseek-chat'); } catch (e) { reject(e); return; }
    req.onerror = () => reject(new Error('µëôÕ╝Ç IndexedDB Õñ▒Þ┤Ñ'));
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction('history-message', 'readwrite');
        const st = tx.objectStore('history-message');
        const d = st.delete(sessionId);
        d.onsuccess = () => { db.close(); resolve(); };
        d.onerror = () => { db.close(); reject(new Error('ÕêáÚÖñ IDB Þ«░Õ¢òÕñ▒Þ┤Ñ')); };
      } catch (e) { db.close(); reject(e); }
    };
  });
}

/** þ¡ëÕ¥à hook µ┤¥ÕÅæþÜä IDB ÕåÖÕàÑÕ«îµêÉõ║ïõ╗Â */
function waitForIdbWrite(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const handler = () => {
      if (done) return;
      done = true;
      window.removeEventListener('cuckoo-idb-history-written', handler);
      clearTimeout(timer);
      resolve();
    };
    window.addEventListener('cuckoo-idb-history-written', handler);
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      window.removeEventListener('cuckoo-idb-history-written', handler);
      reject(new Error('þ¡ëÕ¥à IDB ÕåÖÕàÑÞÂàµùÂ´╝ê' + timeoutMs + 'ms´╝ë'));
    }, timeoutMs);
  });
}

/**
 * õ╗Ä IndexedDB Þ»╗ÕÅûµîçÕ«Üõ╝ÜÞ»ØþÜäÕà¿ÚçÅµÂêµü»´╝îµîë message_id ÕìçÕ║ÅÒÇé
 * ÕÉîµùÂÕÅûÕç║"Õ¢ôÕëìÕÅÂÕ¡ÉµÂêµü» id"´╝êchat_session.current_message_id´╝ë´╝î
 * þö¿õ║Äµ▓┐ parent_id Õø×µ║»õ©╗Õ»╣Þ»ØÚô¥ÒÇé
 */
function getMessagesFromIndexedDB(sessionId: string): Promise<{ list: MessageItem[]; currentMessageId: number | null }> {
  return new Promise((resolve, reject) => {
    let req: any;
    try { req = indexedDB.open('deepseek-chat'); } catch (e) { reject(e); return; }
    req.onerror = () => reject(new Error('µëôÕ╝Ç IndexedDB Õñ▒Þ┤Ñ'));
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction('history-message', 'readonly');
        const store = tx.objectStore('history-message');
        const g = store.get(sessionId);
        g.onsuccess = () => {
          db.close();
          const val = g.result;
          const data = val && val.data;
          const msgs = data && data.chat_messages;
          if (!Array.isArray(msgs)) { reject(new Error('IndexedDB µùáÞ»Ñõ╝ÜÞ»ØµÂêµü»')); return; }
          const list = msgs
            .filter((m: any) => typeof m.message_id === 'number')
            .map((m: any) => ({ message_id: m.message_id, role: m.role || '', parent_id: m.parent_id }))
            .sort((a: any, b: any) => a.message_id - b.message_id);
          const rawLeaf = data && data.chat_session && data.chat_session.current_message_id;
          const currentMessageId = (typeof rawLeaf === 'number') ? rawLeaf : null;
          resolve({ list, currentMessageId });
        };
        g.onerror = () => { db.close(); reject(new Error('Þ»╗ÕÅûµÂêµü»Õñ▒Þ┤Ñ')); };
      } catch (e) { db.close(); reject(e); }
    };
  });
}

/**
 * µ▓┐ parent_id Õø×µ║»Õç║ÒÇîõ©╗Õ»╣Þ»ØÚô¥ÒÇì´╝îÕÅûµ£ÇÞ┐æ ratio µ»öõ¥ï´╝îõ┐ØÞ»üµêÉÕ»╣´╝êUSER + ASSISTANT´╝ë´╝îÞ┐öÕø×ÚÖìÕ║Å idÒÇé
 *
 * õ©║õ╗Çõ╣êõ©ìÞâ¢þø┤µÄÑµîë message_id µÄÆÕ║ÅÕÅûÕ░¥Úâ¿´╝Ü
 *   DeepSeek þÜäµÂêµü»µÿ»**µáæ**ÒÇéÚçìµû░þöƒµêÉ/þ╝ûÞ¥æõ╝Üõ║ºþöƒÕêåµö»´╝êõ©Çõ©¬ parent µ£ëÕñÜõ©¬ child´╝ë´╝î
 *   message_id Õà¿Õ▒ÇÚÇÆÕó× ÔåÆ µîë id µÄÆÕ║Åõ╝Üµèè"Þó½õ©óÕ╝âþÜäÕêåµö»"õ╣ƒµÀÀÞ┐øµØÑ´╝îÞºÆÞë▓Õ║ÅÕêùõ©ìÕåìµÿ»
 *   USER/ASSISTANT õ║ñµø┐ ÔåÆ share/create µèÑ MESSAGES_MUST_APPEAR_IN_PAIRSÒÇé
 *   Õ┐àÚí╗õ╗ÄÒÇîÕ¢ôÕëìÕÅÂÕ¡ÉÒÇìµ▓┐ parent_id Õø×µ║»´╝îÕ¥ùÕê░þ£ƒµ¡úþÜäõ©╗þ║┐ÒÇé
 *
 * @param msgs Õà¿ÚçÅµÂêµü»´╝êõ╗╗µäÅÚí║Õ║Å´╝îÕåàÚâ¿Õ╗║ map´╝ë
 * @param leafId Õ¢ôÕëìÕÅÂÕ¡ÉµÂêµü» id´╝êchat_session.current_message_id´╝ë´╝îµùáÕêÖþö¿µ£ÇÕñº message_id
 * @param ratio ÕÅûµ£ÇÞ┐æµ»öõ¥ï
 */
function pickRecentPairedIds(msgs: MessageItem[], leafId: number | null, ratio: number): number[] {
  if (msgs.length === 0) return [];
  const byId = new Map<number, MessageItem>();
  for (const m of msgs) byId.set(m.message_id, m);

  // 1) þí«Õ«ÜÕÅÂÕ¡É´╝Üõ╝ÿÕàê current_message_id´╝îÕÉªÕêÖþö¿µ£ÇÕñº message_id
  let leaf: number | null = (leafId != null && byId.has(leafId)) ? leafId : null;
  if (leaf == null) {
    let maxId: number | null = null;
    for (const m of msgs) if (maxId == null || m.message_id > maxId) maxId = m.message_id;
    leaf = maxId;
  }
  if (leaf == null) return [];

  // 2) µ▓┐ parent_id Õø×µ║»õ©╗Úô¥´╝êÕÅÂÕ¡É ÔåÆ µá╣´╝ë´╝îÚÿ▓þÄ»
  const chain: MessageItem[] = [];
  const seen = new Set<number>();
  let cur: number | null = leaf;
  while (cur != null && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    const m: MessageItem = byId.get(cur) as MessageItem;
    chain.push(m);
    cur = (typeof m.parent_id === 'number') ? (m.parent_id as number) : null;
  }
  chain.reverse(); // µá╣ ÔåÆ ÕÅÂÕ¡É

  // 3) Õø×µ║»Õñ▒Þ┤Ñ´╝êµùá parent_id µò░µì«´╝ëÔåÆ Õø×ÚÇÇÕê░µùºþÜä"µîë id µÄÆÕ║ÅÕÅûÕ░¥Úâ¿"
  let ordered: MessageItem[];
  if (chain.length <= 1 && msgs.length > 1) {
    ordered = msgs;
  } else {
    ordered = chain;
  }

  // 4) ÕÅûµ£ÇÞ┐æ ratio´╝îõ┐ØÞ»üµêÉÕ»╣
  const total = ordered.length;
  let keep = Math.max(2, Math.round(total * ratio));
  let start = Math.max(0, total - keep);
  while (start > 0 && ordered[start].role !== 'USER') start--;
  let end = total;
  while (end > start + 1 && ordered[end - 1].role !== 'ASSISTANT') end--;
  const picked = ordered.slice(start, end);
  return picked.map((m) => m.message_id).sort((a, b) => b - a);
}

/** Þ░â share/create ÕêøÕ╗║Õêåõ║½´╝îÞ┐öÕø× share_id´╝êÕ©ªÞÂàµùÂ + Õ«îµò┤ÚöÖÞ»»õ┐íµü»´╝ë */
async function createShare(sessionId: string, messageIds: number[], headers: any): Promise<string> {
  const h = Object.assign({}, headers);
  h['content-type'] = 'application/json';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let resp: Response;
  let txt: string;
  try {
    resp = await fetch('/api/v0/share/create', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ chat_session_id: sessionId, message_ids: messageIds }),
      signal: controller.signal,
    });
    txt = await resp.text();
  } catch (err: any) {
    if (err && err.name === 'AbortError') throw new Error('share/create Þ»Àµ▒éÞÂàµùÂ´╝ê30 þºÆ´╝ë');
    throw new Error('share/create Þ»Àµ▒éÕñ▒Þ┤Ñ: ' + ((err && err.message) || String(err)));
  } finally {
    clearTimeout(timeoutId);
  }

  console.log('[Cuckoo Compact] [api] share/create HTTP ' + resp.status + ' ÕôìÕ║ö: ' + txt.slice(0, 600));

  if (!resp.ok) {
    throw new Error('share/create HTTP ' + resp.status + ': ' + txt.slice(0, 200));
  }

  let json: any = null;
  try { json = JSON.parse(txt); } catch (_) {}
  if (!json) {
    throw new Error('share/create ÕôìÕ║öÚØ× JSON: ' + txt.slice(0, 200));
  }
  if (json.code !== 0) {
    throw new Error('share/create Õñ▒Þ┤Ñ: ' + (json.msg || 'µ£¬þƒÑÚöÖÞ»»'));
  }
  const bizCode = json.data && json.data.biz_code;
  if (bizCode !== undefined && bizCode !== 0) {
    throw new Error('share/create õ©ÜÕèíÚöÖÞ»»: ' + (json.data.biz_msg || 'µ£¬þƒÑõ©ÜÕèíÚöÖÞ»»') + ' (biz_code=' + bizCode + ')');
  }
  const shareId = json.data && json.data.biz_data && json.data.biz_data.share_id;
  if (!shareId) {
    throw new Error('share/create ÕôìÕ║öµùá share_id: ' + txt.slice(0, 200));
  }
  return shareId;
}

/** µ«Á1´╝ÜÕ¢ôÕëìÚíÁ ÔÇöÔÇö ÕÅæµæÿÞªü ÔåÆ µ©à IDB ÔåÆ ÕêÀµû░ */
async function runCompaction(projectDir?: string): Promise<void> {
  const btn = document.getElementById('cuckoo-btn-compact') as any;
  if (btn) { btn.disabled = true; btn.textContent = 'ÕÄïþ╝®õ©¡...'; }
  retryEngine.setCompacting(true);
  watchdog.setSuspended(true);

  try {
    const sessionId = getSessionIdFromUrl();
    if (!sessionId) throw new Error('µùáµ│òõ╗Ä URL ÞÄÀÕÅû chat_session_id');
    logStep('api', 'chat_session_id = ' + sessionId);

    // Þ«░õ©ï"ÕÄïþ╝®ÕëìþÜäõ╝ÜÞ»ØID"´╝êµ«Á3 ÕêØÕºïÕîûµû░õ╝ÜÞ»ØµùÂÕåÖÕàÑÞíÇþ╝ÿ´╝ë
    try { localStorage.setItem('cuckoo-compact-parent-session', sessionId); } catch (_) {}

    logStep('summary', 'ÕÅæÚÇüµæÿÞªüµîçõ╗ñ');
    const waitReply = waitForResponse(120000);
    sendToChat(SUMMARY_INSTRUCTION, 'ÕÄïþ╝®-µæÿÞªü', 300);
    const { text: summaryText } = await waitReply;
    logStep('summary', 'µöÂÕê░µæÿÞªüÕø×Õñì´╝îÚò┐Õ║ª=' + (summaryText || '').length);

    // [022] µæÿÞªüÕÀ▓µöÂÕê░´╝îõ╗ÄÞ┐ÖÚçîÕ╝ÇÕºïõ╗╗õ¢òÕ╝éÕ©©Úâ¢ÚçìÞ»ò
    // µ«Á1 Õñ▒Þ┤Ñ ÔåÆ µ©à IDB´╝êÕ░¢Õèø´╝ëÔåÆ ÕÇÆÞ«íµùÂ 20s ÔåÆ ÕêÀµû░´╝êcuckoo-compact=1&compact-retry=2´╝ë
    // µ«Á2 õ╝ÜÞ»╗Õê░ compact-retry Þ«íµò░Õ╣Âþ╗ºþ╗¡ÚçìÞ»ò´╝êµ£ÇÕñÜ 10 µ¼í´╝ë
    const MAX_ATTEMPTS = 10;
    const RETRY_INTERVAL = 20000;
    try {
      logStep('idb', 'µ©àÚÖñ IDB');
      await clearSessionFromIdb(sessionId);

      try {
        if (projectDir) localStorage.setItem(COMPACT_DIR_KEY, projectDir);
        else localStorage.removeItem(COMPACT_DIR_KEY);
      } catch (_) {}

      const url = new URL(location.href);
      url.searchParams.set(COMPACT_URL_FLAG, '1');
      logStep('reload', 'ÕêÀµû░ÚíÁÚØóõ╗ÑÞ«® DeepSeek ÚçìÕ╗║ IDB: ' + url.toString());
      showToast('ÕÄïþ╝®õ©¡´╝îµ¡úÕ£¿ÕêÀµû░ÚíÁÚØó...', 3000);
      location.href = url.toString();
      return;
    } catch (err: any) {
      const errMsg = (err && err.message) || String(err);
      logStep('retry', 'µ©à IDB Õñ▒Þ┤Ñ: ' + errMsg + '´╝î' + (RETRY_INTERVAL / 1000) + 's ÕÉÄÕêÀµû░ÚçìÞ»ò');
      // Õ░¢Õèøµ©à IDB´╝êÕñ▒Þ┤Ñõ╣ƒþ╗ºþ╗¡´╝îÕêÀµû░ÕÉÄµÁÅÞºêÕÖ¿õ╝ÜÚçìÕ╗║´╝ë
      try { await clearSessionFromIdb(sessionId); } catch (_) { /* ignore */ }
      await countdownAndWait(1, MAX_ATTEMPTS, RETRY_INTERVAL, errMsg);
      const url = new URL(location.href);
      url.searchParams.set(COMPACT_URL_FLAG, '1');
      url.searchParams.set('compact-retry', '2');
      location.href = url.toString();
      return;
    }
  } catch (err: any) {
    console.error('[Cuckoo Compact] ÕÄïþ╝®Õñ▒Þ┤Ñ:', err);
    showToast('ÕÄïþ╝®Õñ▒Þ┤Ñ: ' + err.message, 5000);
    retryEngine.setCompacting(false);
    watchdog.setSuspended(false);
    if (btn) { btn.disabled = false; btn.textContent = 'ÕÄïþ╝®'; }
  }
}

/** µ«Á2´╝ÜÕêÀµû░ÕÉÄÕÉîÚíÁ ÔÇöÔÇö µúÇµÁï URL µáçÞ«░´╝îþ¡ë IDB ÕåÖÕàÑ´╝îÕêøÕ╗║Õêåõ║½Õ╣ÂÞÀ│Þ¢¼ */
async function checkPendingCompact(): Promise<boolean> {
  const urlObj = new URL(location.href);
  const flag = urlObj.searchParams.get(COMPACT_URL_FLAG) || '';
  if (!flag) return false;

  const MAX_ATTEMPTS = 10;
  const RETRY_INTERVAL = 20000;

  // Þ»╗ÕÅûÚçìÞ»òÞ«íµò░´╝êõ©èõ©ÇÞ¢«Õñ▒Þ┤ÑÕêÀµû░µùÂÕ©ªÞ┐çµØÑþÜä´╝ë
  let currentAttempt = 1;
  try {
    const rp = urlObj.searchParams.get('compact-retry');
    const parsed = parseInt(rp || '1', 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= MAX_ATTEMPTS) currentAttempt = parsed;
  } catch (_) {}
  logStep('retry', 'µ«Á2 Õ¢ôÕëìÚçìÞ»òµ¼íµò░=' + currentAttempt + '/' + MAX_ATTEMPTS);

  // þ½ïÕì│µ©àµÄë URL ÕÅéµò░´╝îÚü┐ÕàìÚçìÕñìÞºªÕÅæ
  try {
    urlObj.searchParams.delete(COMPACT_URL_FLAG);
    urlObj.searchParams.delete('compact-retry');
    history.replaceState(null, '', urlObj.pathname + urlObj.search + urlObj.hash);
    logStep('reload', 'ÕÀ▓µ©àÚÖñ URL µáçÞ«░');
  } catch (_) {}

  let projectDir: string | null = null;
  try { projectDir = localStorage.getItem(COMPACT_DIR_KEY); } catch (_) {}

  let sessionId: string | null = null;
  try { sessionId = getSessionIdFromUrl(); } catch (_) {}

  try {
    if (!sessionId) throw new Error('µùáµ│òõ╗Ä URL ÞÄÀÕÅû chat_session_id');

    logStep('idb', 'þ¼¼ ' + currentAttempt + '/' + MAX_ATTEMPTS + ' µ¼íÕ░ØÞ»ò´╝Üþ¡ëÕ¥à DeepSeek ÚçìÕ╗║ IDB´╝êþøæÕÉ¼ÕåÖÕàÑõ║ïõ╗Â´╝ë');
    await waitForIdbWrite(IDB_WAIT_TIMEOUT);
    logStep('idb', 'µöÂÕê░ IDB ÕåÖÕàÑõ║ïõ╗Â');

    const headers = getCachedHeaders();
    if (!headers || !headers['authorization']) {
      throw new Error('µ£¬ÞÄÀÕÅûÕê░Þ«ñÞ»üÞ»Àµ▒éÕñ┤´╝êÞ»ÀÕêÀµû░ÚíÁÚØóÕÉÄÚçìÞ»ò´╝ë');
    }

    const { list: allMsgs, currentMessageId } = await getMessagesFromIndexedDB(sessionId);
    if (allMsgs.length === 0) throw new Error('µ£¬Þ»╗ÕÅûÕê░µÂêµü»ÕêùÞí¿');
    const tailIds = pickRecentPairedIds(allMsgs, currentMessageId, 0.2);
    if (tailIds.length === 0) throw new Error('ÞúüÕë¬ÕÉÄµùáµ£ëµòêµÂêµü»');
    logStep('api', 'Õà¿ÚçÅµÂêµü» ' + allMsgs.length + ' µØí´╝êÕÅÂÕ¡É=' + (currentMessageId || '?') + '´╝ë´╝îõ┐ØþòÖµ£ÇÞ┐æ ' + tailIds.length + ' µØí´╝êµêÉÕ»╣´╝ë');

    const shareId = await createShare(sessionId, tailIds, headers);
    const link = 'https://chat.deepseek.com/share/' + shareId;
    logStep('api', 'Õêåõ║½Úô¥µÄÑ: ' + link);

    showToast('ÕÄïþ╝®Õ«îµêÉ´╝îµ¡úÕ£¿µëôÕ╝Çµû░õ╝ÜÞ»Ø...', 3000);
    try {
      localStorage.setItem(PENDING_INIT_KEY, String(Date.now()));
      if (projectDir) localStorage.setItem(COMPACT_DIR_KEY, projectDir);
    } catch (_) {}
    location.href = link;
    return true;
  } catch (err: any) {
    const errMsg = (err && err.message) || String(err);
    if (currentAttempt >= MAX_ATTEMPTS) {
      console.error('[Cuckoo Compact] µ«Á2Õñ▒Þ┤Ñ´╝êÕÀ▓ÚçìÞ»ò ' + MAX_ATTEMPTS + ' µ¼í´╝ë:', errMsg);
      showToast('ÕÄïþ╝®Õñ▒Þ┤Ñ´╝êÕÀ▓ÚçìÞ»ò ' + MAX_ATTEMPTS + ' µ¼í´╝ë: ' + errMsg, 8000);
      return false;
    }
    logStep('retry', 'þ¼¼ ' + currentAttempt + '/' + MAX_ATTEMPTS + ' µ¼íÕñ▒Þ┤Ñ: ' + errMsg + '´╝î' + (RETRY_INTERVAL / 1000) + 's ÕÉÄÕêÀµû░ÚçìÞ»ò');
    // Õ░¢Õèøµ©à IDB´╝êÕñ▒Þ┤Ñõ╣ƒþ╗ºþ╗¡´╝îÕêÀµû░ÕÉÄµÁÅÞºêÕÖ¿õ╝ÜÚçìÕ╗║´╝ë
    if (sessionId) {
      try { await clearSessionFromIdb(sessionId); } catch (_) { /* ignore */ }
    }
    await countdownAndWait(currentAttempt, MAX_ATTEMPTS, RETRY_INTERVAL, errMsg);
    const u = new URL(location.href);
    u.searchParams.set(COMPACT_URL_FLAG, '1');
    u.searchParams.set('compact-retry', String(currentAttempt + 1));
    location.href = u.toString();
    return false;
  }
}

/** µ«Á3´╝ÜÕêåõ║½ÚíÁ ÔÇöÔÇö µúÇµÁïÕ¥àÕêØÕºïÕîûµáçÞ«░´╝îÞç¬Õè¿ÕêØÕºïÕîûÚí╣þø« */
function checkPendingInit(): void {
  let pending = null;
  let projectDir = null;
  try {
    pending = localStorage.getItem(PENDING_INIT_KEY);
    projectDir = localStorage.getItem(COMPACT_DIR_KEY);
  } catch (_) {}
  if (!pending) return;
  try {
    localStorage.removeItem(PENDING_INIT_KEY);
    localStorage.removeItem(COMPACT_DIR_KEY);
  } catch (_) {}
  let parentSessionId = null;
  try { parentSessionId = localStorage.getItem('cuckoo-compact-parent-session'); } catch (_) {}
  console.log('[Cuckoo Compact] µúÇµÁïÕê░ÕÄïþ╝®ÕÉÄÕ¥àÕêØÕºïÕîû´╝î3 þºÆÕÉÄµëºÞíî´╝øÚí╣þø«þø«Õ¢ò=' + (projectDir || '(µùá)') + '´╝îÕÄïþ╝®Õëìõ╝ÜÞ»Ø=' + (parentSessionId || '(µùá)'));
  setTimeout(async () => {
    // þ│╗þ╗ƒµÅÉþñ║Þ»ì + õ║ñµÄÑµÅÉþñ║ÕÉêÕ╣Âõ©║**õ©ÇµØíµÂêµü»**´╝êÚÇÜÞ┐ç extraPrompt Þ┐¢ÕèáÕ£¿þ│╗þ╗ƒµÅÉþñ║Þ»ìµ£½Õ░¥´╝ëÒÇé
    // ÔÜá´©Å õ©ìÞâ¢Õêåõ©ñµ¼íÕÅæ´╝ÜinitProject ÕåàÚâ¿Õí½ÕàÑÕÉÄÞªüþ¡ë 2~4 þºÆÚÜÅµ£║Õ╗ÂÞ┐ƒµëìÕÅæÚÇü´╝î
    //    ÞïÑµ¡ñµùÂÕåìÞ░â sendToChat ÕÅæõ║ñµÄÑµÅÉþñ║´╝îõ╝ÜÞªåþøûÞ¥ôÕàÑµíåÚçîµ£¬ÕÅæÕç║þÜäþ│╗þ╗ƒµÅÉþñ║Þ»ì´╝êÕ«×µÁï bug´╝ëÒÇé
    try {
      await (window as any).electronAPI.initProject(projectDir || null, true, CONTEXT_HANDOFF_INSTRUCTION, false, parentSessionId);
      console.log('[Cuckoo Compact] ÕÀ▓ÕÅæÚÇüþ│╗þ╗ƒµÅÉþñ║Þ»ì + õ©èõ©ïµûçõ║ñµÄÑµÅÉþñ║´╝êÕÉêÕ╣Âõ©║õ©ÇµØí´╝ë');
    } catch (err) {
      console.error('[Cuckoo Compact] ÕÄïþ╝®ÕÉÄÕêØÕºïÕîûÕñ▒Þ┤Ñ:', err);
    }
  }, 3000);
}

/**
 * µ«ÁA´╝Üþ¬ùÕÅúþ╗äÞ¢¼þº╗ ÔÇöÔÇö µ©à IDB + ÕêÀµû░´╝îÞ«® DeepSeek ÚçìÕåÖÕ«îµò┤ÕÄåÕÅ▓ÒÇé
 * õ©ÄÕÄïþ╝®ÕÉîµ║É´╝îõ¢å´╝ÜÔæá ratio=1.0´╝êÕà¿ÚçÅÕêåõ║½´╝ëÔæí õ©ìÞÀ│Þ¢¼´╝êshareId õ©èµèÑõ©╗Þ┐øþ¿ï´╝îþö▒õ©╗Þ┐øþ¿ïÕ»╝Þê¬þø«µáçþ¬ùÕÅú´╝ëÒÇé
 * @param switchId µ£¼µ¼íÞ¢¼þº╗þÜäÕö»õ©Ç id´╝êÞÀ¿ÕêÀµû░Õà│Þüö´╝ë
 */
async function prepareSwitchShare(switchId: string): Promise<void> {
  const sessionId = getSessionIdFromUrl();
  if (!sessionId) throw new Error('µùáµ│òõ╗Ä URL ÞÄÀÕÅû chat_session_id');
  logStep('switch', 'ÕçåÕñçÞ¢¼þº╗Õêåõ║½ sessionId=' + sessionId + ' switchId=' + switchId);
  // Õ¡ÿ switchId´╝êÞÀ¿ÕêÀµû░Õà│Þüö´╝ë
  try { localStorage.setItem(SWITCH_ID_KEY, switchId); } catch (_) {}
  // µ©àÕ¢ôÕëìõ╝ÜÞ»Ø IDB Þ«░Õ¢ò´╝êÞºªÕÅæÕêÀµû░ÕÉÄ DeepSeek Úçìµû░µïëÕÅûÕ«îµò┤ÕÄåÕÅ▓´╝ë
  logStep('switch', 'µ©àÚÖñÕ¢ôÕëìõ╝ÜÞ»Ø IDB Þ«░Õ¢ò');
  await clearSessionFromIdb(sessionId);
  // URL ÕèáµáçÞ«░ ÔåÆ ÕêÀµû░
  const url = new URL(location.href);
  url.searchParams.set(SWITCH_URL_FLAG, '1');
  logStep('switch', 'ÕêÀµû░ÚíÁÚØóõ╗ÑÚçìÕ╗║ IDB: ' + url.toString());
  showToast('µ¡úÕ£¿ÕçåÕñçÞ¢¼þº╗Õ»╣Þ»Ø...', 3000);
  location.href = url.toString();
}

/**
 * µ«ÁB´╝ÜÕêÀµû░ÕÉÄÕÉîÚíÁ ÔÇöÔÇö þ¡ë IDB ÕåÖÕàÑ ÔåÆ Þ»╗Õà¿ÚçÅ ÔåÆ Õêåõ║½ ÔåÆ õ©èµèÑ shareId´╝êõ©ìÞÀ│Þ¢¼´╝ëÒÇé
 * @returns µÿ»ÕÉªÕñäþÉåõ║åµ£¼µ¼íÞ¢¼þº╗µáçÞ«░
 */
async function checkPendingSwitch(): Promise<boolean> {
  let flag = '';
  try { flag = new URL(location.href).searchParams.get(SWITCH_URL_FLAG) || ''; } catch (_) {}
  if (!flag) return false;

  // µ©à URL µáçÞ«░´╝îÚü┐ÕàìÚçìÕñìÞºªÕÅæ
  try {
    const url = new URL(location.href);
    url.searchParams.delete(SWITCH_URL_FLAG);
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    logStep('switch', 'ÕÀ▓µ©àÚÖñ URL µáçÞ«░');
  } catch (_) {}

  let switchId = '';
  try { switchId = localStorage.getItem(SWITCH_ID_KEY) || ''; } catch (_) {}

  try {
    const sessionId = getSessionIdFromUrl();
    if (!sessionId) throw new Error('µùáµ│òõ╗Ä URL ÞÄÀÕÅû chat_session_id');

    logStep('switch', 'þ¡ëÕ¥à DeepSeek ÚçìÕ╗║ IDB´╝êþøæÕÉ¼ÕåÖÕàÑõ║ïõ╗Â´╝ë');
    await waitForIdbWrite(IDB_WAIT_TIMEOUT);
    logStep('switch', 'µöÂÕê░ IDB ÕåÖÕàÑõ║ïõ╗Â');

    const headers = getCachedHeaders();
    if (!headers || !headers['authorization']) {
      throw new Error('µ£¬ÞÄÀÕÅûÕê░Þ«ñÞ»üÞ»Àµ▒éÕñ┤´╝êÞ»ÀÕêÀµû░ÚíÁÚØóÕÉÄÚçìÞ»ò´╝ë');
    }

    const { list: allMsgs, currentMessageId } = await getMessagesFromIndexedDB(sessionId);
    if (allMsgs.length === 0) throw new Error('µ£¬Þ»╗ÕÅûÕê░µÂêµü»ÕêùÞí¿');
    const ids = pickRecentPairedIds(allMsgs, currentMessageId, 1.0);
    if (ids.length === 0) throw new Error('µùáµ£ëµòêµÂêµü»ÕÅ»Õêåõ║½');
    logStep('switch', 'Õà¿ÚçÅµÂêµü» ' + allMsgs.length + ' µØí´╝êÕÅÂÕ¡É=' + (currentMessageId || '?') + '´╝ë´╝îÕêåõ║½ ' + ids.length + ' µØí');

    const shareId = await createShare(sessionId, ids, headers);
    logStep('switch', 'Õêåõ║½µêÉÕèƒ shareId=' + shareId);

    // õ©èµèÑõ©╗Þ┐øþ¿ï´╝êõ©ìÞÀ│Þ¢¼´╝îþö▒õ©╗Þ┐øþ¿ïÕ»╝Þê¬þø«µáçþ¬ùÕÅú´╝ë
    try {
      (window as any).electronAPI.switchShareReady({ switchId, shareId, sessionId });
      logStep('switch', 'ÕÀ▓õ©èµèÑõ©╗Þ┐øþ¿ï');
    } catch (err: any) {
      console.error('[Cuckoo Compact] õ©èµèÑÞ¢¼þº╗Õêåõ║½Õñ▒Þ┤Ñ:', err);
    }
    return true;
  } catch (err: any) {
    console.error('[Cuckoo Compact] µ«ÁB(Þ¢¼þº╗)Õñ▒Þ┤Ñ:', err);
    // õ©èµèÑÕñ▒Þ┤Ñ´╝êÞ«®õ©╗Þ┐øþ¿ïÕÅèµùÂÞÄÀþƒÑ´╝îõ©ìþ¡ëÞÂàµùÂ´╝ë
    try { (window as any).electronAPI.switchShareReady({ switchId, error: err.message }); } catch (_) {}
    return false;
  }
}

export { runCompaction, checkPendingCompact, checkPendingInit, prepareSwitchShare, checkPendingSwitch };
// þ║»Õç¢µò░Õ»╝Õç║´╝êµÁïÞ»òþö¿´╝ë
export { pickRecentPairedIds as _pickRecentPairedIds };
