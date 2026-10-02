/**
 * 窗口列表页：列出/新建/切换/删除窗口、默认打开。
 */
import { api, ckConfirm, escapeHtml } from '../shared.js';

const PROVIDER_COLORS: Record<string, string> = {
  deepseek: 'linear-gradient(135deg, #4d6bfe, #3b5bdb)',
  claude: 'linear-gradient(135deg, #d97757, #c05a3a)',
  chatgpt: 'linear-gradient(135deg, #10a37f, #0d8a6b)',
};

function providerAvatarStyle(providerId: string): string {
  return PROVIDER_COLORS[providerId] || '';
}

export async function renderWindowList(): Promise<void> {
  const listEl = document.getElementById('win-list');
  if (!listEl || !api.listProfiles) return;
  try {
    const res = await api.listProfiles();
    const profiles = (res && res.success) ? res.profiles : [];
    if (!profiles || profiles.length === 0) {
      listEl.innerHTML = '<div class="ck-list-empty">暂无窗口</div>';
      return;
    }
    const providerMap: Record<string, string> = {};
    try {
      const pvRes = await (api as any).listProviders?.();
      if (pvRes && pvRes.success) (pvRes.providers || []).forEach((p: any) => { providerMap[p.id] = p.name; });
    } catch (_) { /* ignore */ }
    listEl.innerHTML = profiles.map((p: any) => {
      const pname = providerMap[p.providerId] || '未选平台';
      const checked = p.autoOpen === true ? ' checked' : '';
      const initial = (p.name || '?').trim().charAt(0).toUpperCase();
      const avatarStyle = providerAvatarStyle(p.providerId);
      return '<div class="ck-win-item" data-profile-id="' + escapeHtml(p.id) + '">' +
        '<div class="ck-win-top">' +
          '<span class="ck-win-avatar"' + (avatarStyle ? ' style="background:' + avatarStyle + '"' : '') + '>' + escapeHtml(initial) + '</span>' +
          '<span class="ck-win-name">' + escapeHtml(p.name) + '</span>' +
          '<span class="ck-win-del" data-profile-id="' + escapeHtml(p.id) + '" title="删除窗口">✕</span>' +
        '</div>' +
        '<div class="ck-win-bottom">' +
          '<span class="ck-win-provider">' + escapeHtml(pname) + '</span>' +
          '<label class="ck-win-check' + (p.autoOpen === true ? ' ck-win-check-on' : '') + '" title="启动时默认打开">' +
            '<input type="checkbox" data-profile-id="' + escapeHtml(p.id) + '"' + checked + ' />默认打开' +
          '</label>' +
        '</div>' +
      '</div>';
    }).join('');

    listEl.querySelectorAll('.ck-win-check input').forEach((cb: any) => {
      cb.addEventListener('click', (e: any) => e.stopPropagation());
      cb.addEventListener('change', async () => {
        const pid = cb.dataset.profileId;
        const on = cb.checked;
        const label = cb.closest('.ck-win-check');
        try {
          const r = await api.setProfileAutoOpen?.(pid, on);
          if (!r || !r.success) cb.checked = !on;
          else if (label) label.classList.toggle('ck-win-check-on', on);
        } catch (_) { cb.checked = !on; }
      });
    });
    listEl.querySelectorAll('.ck-win-item').forEach((el: any) => {
      el.addEventListener('click', async (e: any) => {
        if (e.target.classList.contains('ck-win-del')) return;
        if (e.target.closest('.ck-win-check')) return;
        try { await api.openProfileWindow?.(el.dataset.profileId); } catch (_) { /* ignore */ }
      });
    });
    listEl.querySelectorAll('.ck-win-del').forEach((btn: any) => {
      btn.addEventListener('click', async (e: any) => {
        e.stopPropagation();
        const pid = btn.dataset.profileId;
        const name = (btn.closest('.ck-win-item').querySelector('.ck-win-name') || {}).textContent || '该窗口';
        if (!(await ckConfirm('确定删除窗口「' + name + '」？此操作不可恢复。'))) return;
        try {
          const r = await api.deleteProfileWindow?.(pid);
          if (r && r.success) renderWindowList();
        } catch (_) { /* ignore */ }
      });
    });
  } catch (_) {
    listEl.innerHTML = '<div class="ck-list-empty">加载失败</div>';
  }
}

document.getElementById('win-new')?.addEventListener('click', async () => {
  try { await api.createProfileWindow?.(); renderWindowList(); } catch (_) { /* ignore */ }
});
document.getElementById('win-refresh')?.addEventListener('click', renderWindowList);
