/**
 * 设置页：失败重试 / 发送延迟 / 附件间隔。
 */
import { api, ckAlert, ckConfirm } from '../shared.js';

const SET_FIELDS: [string, string][] = [
  ['retry-delay-min', 'retryDelayMin'],
  ['retry-delay-max', 'retryDelayMax'],
  ['retry-count', 'retryCount'],
  ['retry-429-delay', 'retry429Delay'],
  ['retry-429-count', 'retry429Count'],
  ['retry-prompt', 'retryPrompt'],
  ['xhr-idle-timeout', 'xhrIdleTimeout'],
  ['watchdog-prompt', 'watchdogPrompt'],
  ['watchdog-count', 'watchdogCount'],
  ['send-delay-min', 'sendDelayMin'],
  ['send-delay-max', 'sendDelayMax'],
  ['attach-delay-min', 'attachDelayMin'],
  ['attach-delay-max', 'attachDelayMax'],
];

function setVal(id: string, v: any): void {
  const el = document.getElementById('st-' + id) as any;
  if (el) el.value = (v === null || v === undefined) ? '' : v;
}
function getVal(id: string): string {
  const el = document.getElementById('st-' + id) as any;
  return el ? el.value : '';
}
function renderSettings(data: any): void {
  if (!data) return;
  const enEl = document.getElementById('st-retry-enabled') as any;
  if (enEl) enEl.checked = data.retryEnabled !== false;
  for (const [id, key] of SET_FIELDS) setVal(id, data[key]);
}

export async function loadSettings(): Promise<void> {
  if (!api.getSettings) return;
  try {
    const r = await api.getSettings();
    if (r && r.success && r.data) renderSettings(r.data);
  } catch (_) { /* ignore */ }
}

function collectSettings(): any {
  const num = (id: string) => { const n = parseFloat(getVal(id)); return Number.isFinite(n) ? n : 0; };
  const enEl = document.getElementById('st-retry-enabled') as any;
  return {
    retryEnabled: !!(enEl && enEl.checked),
    retryDelayMin: num('retry-delay-min'),
    retryDelayMax: num('retry-delay-max'),
    retryCount: parseInt(getVal('retry-count'), 10) || 0,
    retry429Delay: num('retry-429-delay'),
    retry429Count: parseInt(getVal('retry-429-count'), 10) || 0,
    retryPrompt: getVal('retry-prompt'),
    xhrIdleTimeout: num('xhr-idle-timeout'),
    watchdogPrompt: getVal('watchdog-prompt'),
    watchdogCount: parseInt(getVal('watchdog-count'), 10) || 0,
    sendDelayMin: num('send-delay-min'),
    sendDelayMax: num('send-delay-max'),
    attachDelayMin: num('attach-delay-min'),
    attachDelayMax: num('attach-delay-max'),
  };
}

const stSaveBtn = document.getElementById('st-save') as any;
if (stSaveBtn) stSaveBtn.addEventListener('click', async () => {
  if (!api.saveSettings) return;
  stSaveBtn.disabled = true;
  try {
    const r = await api.saveSettings(collectSettings());
    if (r && r.success) {
      if (r.data) renderSettings(r.data);
      stSaveBtn.textContent = '已保存';
      setTimeout(() => { stSaveBtn.textContent = '保存设置'; }, 1200);
    } else {
      await ckAlert((r && r.error) || '保存失败');
    }
  } catch (e: any) { await ckAlert('保存失败: ' + (e.message || e)); }
  stSaveBtn.disabled = false;
});
document.getElementById('st-refresh')?.addEventListener('click', loadSettings);
document.getElementById('st-reset')?.addEventListener('click', async () => {
  if (!api.resetSettings) return;
  if (!(await ckConfirm('确定恢复默认设置？'))) return;
  try {
    const r = await api.resetSettings();
    if (r && r.success && r.data) renderSettings(r.data);
  } catch (_) { /* ignore */ }
});
