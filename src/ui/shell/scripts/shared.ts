/**
 * 壳页面共享模块：API、通用弹框、HTML 转义、格式化。
 */
import type { ShellAPI } from './shell-api.js';

/** 暴露的壳页面 API（preload 注入） */
export const api: ShellAPI = (window as any).shellAPI || {};

// ===== 通用弹框（替代原生 alert/confirm）=====
export function ckDialog(opts: { title?: string; message?: string; confirm?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const mask = document.getElementById('ck-dialog');
    const titleEl = document.getElementById('ck-dialog-title');
    const msgEl = document.getElementById('ck-dialog-msg');
    const okBtn = document.getElementById('ck-dialog-ok') as any;
    const cancelBtn = document.getElementById('ck-dialog-cancel') as any;
    if (!mask || !okBtn || !cancelBtn) { resolve(true); return; }
    if (titleEl) titleEl.textContent = opts.title || '提示';
    if (msgEl) msgEl.textContent = opts.message || '';
    cancelBtn.classList.toggle('cuckoo-hidden', !opts.confirm);
    function cleanup() {
      mask!.classList.add('cuckoo-hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      mask!.removeEventListener('click', onMask);
    }
    function onOk() { cleanup(); resolve(true); }
    function onCancel() { cleanup(); resolve(false); }
    function onMask(e: any) { if (e.target === mask) { cleanup(); resolve(false); } }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    mask.addEventListener('click', onMask);
    mask.classList.remove('cuckoo-hidden');
  });
}

export function ckConfirm(message: string, title?: string): Promise<boolean> {
  return ckDialog({ title: title || '确认', message, confirm: true });
}

export function ckAlert(message: string, title?: string): Promise<boolean> {
  return ckDialog({ title: title || '提示', message, confirm: false });
}

// ===== HTML 转义 =====
export function escapeHtml(s: any): string {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(s: any): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

// ===== 数字格式化 =====
export function formatTokenCount(n: number): string {
  if (!isFinite(n) || n < 0) return '0';
  if (n >= 100000000) return (n / 100000000).toFixed(2) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(2) + '万';
  return String(Math.round(n));
}

export function formatTokenCountHTML(n: number): string {
  if (!isFinite(n) || n < 0) return '0';
  if (n >= 100000000) return (n / 100000000).toFixed(2) + '<span class="ck-token-unit-char">亿</span>';
  if (n >= 10000) return (n / 10000).toFixed(2) + '<span class="ck-token-unit-char">万</span>';
  return String(Math.round(n));
}

export function formatShort(n: number): string {
  if (!isFinite(n) || n <= 0) return '0';
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return String(Math.round(n));
}
