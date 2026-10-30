/**
 * WhatsApp 同步页：连接状态、QR、绑定管理、推送选项。
 */
import { api, ckAlert } from '../shared.js';

function renderWhatsappStatus(status: string, detail: string): void {
  const dot = document.getElementById('wa-dot');
  const txt = document.getElementById('wa-status-text');
  const wrap = document.getElementById('wa-qr-wrap');
  if (dot) {
    dot.className = 'fs-dot' + (status === 'connected' ? ' connected' : status === 'error' ? ' error' : status === 'connecting' || status === 'qr' ? ' connecting' : '');
  }
  if (txt) {
    const label = status === 'connected' ? '已连接' : status === 'qr' ? '等待扫码' : status === 'connecting' ? '连接中…' : status === 'error' ? ('错误：' + (detail || '')) : '未连接';
    txt.textContent = label;
  }
  if (wrap) wrap.style.display = status === 'qr' ? 'block' : 'none';
}

async function refreshQR(): Promise<void> {
  if (!api.getWhatsappQr) return;
  try {
    const r = await api.getWhatsappQr();
    renderWhatsappStatus(r.status, r.detail || '');
    const img = document.getElementById('wa-qr-img') as any;
    if (img && r.qrDataUrl) img.src = r.qrDataUrl;
  } catch (_) { /* ignore */ }
}

async function renderBindings(): Promise<void> {
  if (!api.getWhatsappBinding) return;
  const list = document.getElementById('wa-binding-list');
  const select = document.getElementById('wa-active-select') as any;
  if (!list) return;
  try {
    const r = await api.getWhatsappBinding();
    const bindings = (r && r.bindings) || [];
    // 填充"当前回复目标"下拉框
    if (select) {
      select.innerHTML = '';
      if (bindings.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '（未选择）';
        select.appendChild(opt);
      } else {
        for (const b of bindings) {
          const opt = document.createElement('option');
          opt.value = b.jid;
          opt.textContent = (b.name || b.jid) + ' (' + b.type + ')';
          if (b.active) opt.selected = true;
          select.appendChild(opt);
        }
      }
    }
    if (bindings.length === 0) {
      list.innerHTML = '<p class="ck-about-tip">还没有绑定任何会话。</p>';
      return;
    }
    list.innerHTML = '';
    for (const b of bindings) {
      const row = document.createElement('div');
      row.className = 'ck-set-field';
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;';
      row.innerHTML =
        '<span style="flex:1;font-size:13px;">' +
        (b.active ? '● ' : '○ ') +
        (b.name || b.jid) +
        ' <span style="opacity:.6;font-size:11px;">(' + b.type + ')</span></span>';
      const btnActive = document.createElement('button');
      btnActive.className = 'ck-btn ck-btn-secondary';
      btnActive.textContent = '设为回复目标';
      btnActive.style.cssText = 'font-size:11px;padding:2px 8px;';
      btnActive.onclick = async () => {
        if (!api.setWhatsappActive) return;
        await api.setWhatsappActive(b.jid);
        await renderBindings();
      };
      const btnDel = document.createElement('button');
      btnDel.className = 'ck-btn ck-btn-secondary';
      btnDel.textContent = '移除';
      btnDel.style.cssText = 'font-size:11px;padding:2px 8px;';
      btnDel.onclick = async () => {
        if (!api.unbindWhatsappJid) return;
        await api.unbindWhatsappJid(b.jid);
        await renderBindings();
      };
      row.appendChild(btnActive);
      row.appendChild(btnDel);
      list.appendChild(row);
    }
  } catch (_) { /* ignore */ }
}

export async function loadWhatsapp(): Promise<void> {
  if (!api.getWhatsappConfig) return;
  try {
    const r = await api.getWhatsappConfig();
    if (!r || !r.success) return;
    const c = r.config || {};
    const enabledEl = document.getElementById('wa-enabled') as any;
    const uEl = document.getElementById('wa-push-user') as any;
    const aEl = document.getElementById('wa-push-ai') as any;
    const tEl = document.getElementById('wa-push-tool') as any;
    if (enabledEl) enabledEl.checked = !!c.enabled;
    if (uEl) uEl.checked = c.pushUserMessage !== false;
    if (aEl) aEl.checked = c.pushAiReply !== false;
    if (tEl) tEl.checked = c.pushToolStatus !== false;
    renderWhatsappStatus(r.status, r.statusDetail || '');
    if (r.status === 'qr') await refreshQR();
    await renderBindings();
  } catch (_) { /* ignore */ }
}

async function saveWhatsapp(): Promise<void> {
  if (!api.saveWhatsappConfig) return;
  const enabledEl = document.getElementById('wa-enabled') as any;
  const uEl = document.getElementById('wa-push-user') as any;
  const aEl = document.getElementById('wa-push-ai') as any;
  const tEl = document.getElementById('wa-push-tool') as any;
  try {
    const r = await api.saveWhatsappConfig({
      enabled: !!(enabledEl && enabledEl.checked),
      pushUserMessage: !!(uEl && uEl.checked),
      pushAiReply: !!(aEl && aEl.checked),
      pushToolStatus: !!(tEl && tEl.checked),
    });
    if (!r || !r.success) {
      if (ckAlert) ckAlert('保存失败：' + ((r && r.error) || '未知错误'));
      return;
    }
    await loadWhatsapp();
  } catch (err: any) {
    if (ckAlert) ckAlert('保存失败：' + (err && err.message));
  }
}

async function reconnectWhatsapp(): Promise<void> {
  if (!api.reconnectWhatsapp) return;
  await api.reconnectWhatsapp();
  await loadWhatsapp();
  await refreshQR();
}

async function disconnectWhatsapp(): Promise<void> {
  if (!api.disconnectWhatsapp) return;
  await api.disconnectWhatsapp();
  await loadWhatsapp();
}

async function addBinding(): Promise<void> {
  if (!api.bindWhatsappJid) return;
  const jidEl = document.getElementById('wa-jid-input') as any;
  const nameEl = document.getElementById('wa-name-input') as any;
  const jid = (jidEl && jidEl.value || '').trim();
  const name = (nameEl && nameEl.value || '').trim();
  if (!jid) {
    if (ckAlert) ckAlert('请输入 jid');
    return;
  }
  const r = await api.bindWhatsappJid(jid, name || jid, false);
  if (!r || !r.success) {
    if (ckAlert) ckAlert('添加失败：' + ((r && r.error) || '未知错误'));
    return;
  }
  if (jidEl) jidEl.value = '';
  if (nameEl) nameEl.value = '';
  await renderBindings();
}

document.getElementById('wa-active-select')?.addEventListener('change', async (e: any) => {
  const jid = e && e.target && e.target.value;
  if (!jid || !api.setWhatsappActive) return;
  await api.setWhatsappActive(jid);
  await renderBindings();
});
document.getElementById('wa-save')?.addEventListener('click', saveWhatsapp);
document.getElementById('wa-reconnect')?.addEventListener('click', reconnectWhatsapp);
document.getElementById('wa-disconnect')?.addEventListener('click', disconnectWhatsapp);
document.getElementById('wa-add-binding')?.addEventListener('click', addBinding);
document.getElementById('wa-refresh-binding')?.addEventListener('click', () => { renderBindings(); });

// 状态轮询：QR 时每 2s 刷新一次
setInterval(() => {
  if (!api.getWhatsappQr) return;
  api.getWhatsappConfig?.().then((r: any) => {
    if (r && r.status === 'qr') refreshQR();
  }).catch(() => {});
}, 2000);
