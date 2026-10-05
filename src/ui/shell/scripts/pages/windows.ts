/**
 * 窗口列表页：列出/新建/切换/删除窗口、默认打开。
 */
import { api, ckConfirm, ckPrompt, escapeHtml, escapeAttr } from '../shared.js';

const PROVIDER_COLORS: Record<string, string> = {
  deepseek: 'linear-gradient(135deg, #4d6bfe, #3b5bdb)',
  claude: 'linear-gradient(135deg, #d97757, #c05a3a)',
  chatgpt: 'linear-gradient(135deg, #10a37f, #0d8a6b)',
};

function providerAvatarStyle(providerId: string): string {
  return PROVIDER_COLORS[providerId] || '';
}

/** 渲染单个窗口卡片（窗口组内外共用） */
function renderWindowItem(p: any, providerMap: Record<string, string>): string {
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
    // 取窗口组
    let groups: any[] = [];
    try { const gr = await (api as any).wgList?.(); if (gr && gr.success) groups = gr.groups || []; } catch (_) { /* ignore */ }
    const inGroup = new Set<string>();
    for (const g of groups) for (const w of (g.windowIds || [])) inGroup.add(w);
    const byId: Record<string, any> = {};
    for (const p of profiles) byId[p.id] = p;

    let html = '';
    // 已分组的窗口
    for (const g of groups) {
      const members = (g.windowIds || []).map((w: string) => byId[w]).filter(Boolean);
      html += '<div class="ck-wg" data-group-id="' + escapeAttr(g.id) + '">' +
        '<div class="ck-wg-head">' +
          '<span class="ck-wg-name">' + escapeHtml(g.name) + '</span>' +
          '<span class="ck-wg-count">' + members.length + ' 个窗口</span>' +
          '<span class="ck-wg-switch" data-group-id="' + escapeAttr(g.id) + '" title="切换到组内下一个窗口">切换</span>' +
          '<span class="ck-wg-del" data-group-id="' + escapeAttr(g.id) + '" title="删除组">✕</span>' +
        '</div>' +
        '<div class="ck-wg-body">' + members.map((p: any) => renderWindowItem(p, providerMap)).join('') + '</div>' +
      '</div>';
    }
    // 未分组的窗口
    const ungrouped = profiles.filter((p: any) => !inGroup.has(p.id));
    if (ungrouped.length) {
      html += '<div class="ck-wg ck-wg-ungrouped">' +
        '<div class="ck-wg-head"><span class="ck-wg-name">未分组</span><span class="ck-wg-count">' + ungrouped.length + ' 个窗口</span></div>' +
        '<div class="ck-wg-body">' + ungrouped.map((p: any) => renderWindowItem(p, providerMap)).join('') + '</div>' +
      '</div>';
    }
    listEl.innerHTML = html;

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
    // 组：切换（占位，链路后续实现）
    listEl.querySelectorAll('.ck-wg-switch').forEach((btn: any) => {
      btn.addEventListener('click', async (e: any) => {
        e.stopPropagation();
        const gid = btn.dataset.groupId;
        console.log('[窗口组] 切换（待实现链路）: ' + gid);
        if ((api as any).wgSwitch) { try { await (api as any).wgSwitch(gid); } catch (_) { /* ignore */ } }
      });
    });
    // 组：删除组
    listEl.querySelectorAll('.ck-wg-del').forEach((btn: any) => {
      btn.addEventListener('click', async (e: any) => {
        e.stopPropagation();
        const gid = btn.dataset.groupId;
        if (!(await ckConfirm('确定删除该窗口组？（窗口本身不删）'))) return;
        try { await (api as any).wgDelete?.(gid); renderWindowList(); } catch (_) { /* ignore */ }
      });
    });
    // 窗口：右键"加入组"（简化：长按/右键菜单）
    listEl.querySelectorAll('.ck-win-item').forEach((el: any) => {
      el.addEventListener('contextmenu', async (e: any) => {
        e.preventDefault();
        e.stopPropagation();
        const pid = el.dataset.profileId;
        await showJoinGroupMenu(pid, e.clientX, e.clientY);
      });
    });
  } catch (_) {
    listEl.innerHTML = '<div class="ck-list-empty">加载失败</div>';
  }
}

/** 弹出"加入组"菜单：选已有组 / 新建组 */
async function showJoinGroupMenu(windowId: string, x: number, y: number): Promise<void> {
  let groups: any[] = [];
  try { const gr = await (api as any).wgList?.(); if (gr && gr.success) groups = gr.groups || []; } catch (_) { /* ignore */ }
  const menu = document.createElement('div');
  menu.className = 'ck-ctx-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  let items = '';
  for (const g of groups) {
    items += '<div class="ck-ctx-item" data-gid="' + escapeAttr(g.id) + '">' + escapeHtml(g.name) + '</div>';
  }
  items += '<div class="ck-ctx-item ck-ctx-item-new" data-new="1">＋ 新建组…</div>';
  menu.innerHTML = items;
  document.body.appendChild(menu);
  const close = () => { try { menu.remove(); } catch (_) {} document.removeEventListener('click', close); };
  setTimeout(() => document.addEventListener('click', close), 0);
  menu.querySelectorAll('.ck-ctx-item').forEach((it: any) => {
    it.addEventListener('click', async (e: any) => {
      e.stopPropagation();
      close();
      if (it.dataset.new) {
        const name = await ckPrompt({ title: '新建窗口组', placeholder: '组名（可空）', value: '' });
        if (name === null) return;
        try {
          const cr = await (api as any).wgCreate?.(name || undefined);
          if (cr && cr.success && cr.group) await (api as any).wgAddWindow?.(cr.group.id, windowId);
          renderWindowList();
        } catch (_) { /* ignore */ }
      } else if (it.dataset.gid) {
        try { await (api as any).wgAddWindow?.(it.dataset.gid, windowId); renderWindowList(); } catch (_) { /* ignore */ }
      }
    });
  });
}

document.getElementById('win-new')?.addEventListener('click', async () => {
  try { await api.createProfileWindow?.(); renderWindowList(); } catch (_) { /* ignore */ }
});
document.getElementById('win-refresh')?.addEventListener('click', renderWindowList);
