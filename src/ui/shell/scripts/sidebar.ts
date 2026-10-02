/**
 * 侧边栏：标签切换 + 收起/展开。
 * 用注册表解耦（各页面自己注册 tab 名 → 加载函数）。
 */
import { api } from './shared.js';

const abItems = document.querySelectorAll('.ck-ab-item');
const tabs = document.querySelectorAll('.ck-tab');
const sidebar = document.getElementById('ck-sidebar');
const SIDEBAR_EXPANDED = 320;
const SIDEBAR_COLLAPSED = 46;

/** tab 名 → 切换时调用的加载函数（各页面注册） */
const tabLoaders: Record<string, () => void> = {};

export function registerTab(tab: string, loader: () => void): void {
  tabLoaders[tab] = loader;
}

export function setCollapsed(collapsed: boolean): void {
  if (!sidebar) return;
  if (collapsed) sidebar.classList.add('ck-collapsed');
  else sidebar.classList.remove('ck-collapsed');
  if (api.toggleSidebar) api.toggleSidebar(collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED);
}

function activateTab(item: any, tab: string): void {
  abItems.forEach((i: any) => i.classList.remove('ck-ab-active'));
  item.classList.add('ck-ab-active');
  tabs.forEach((p: any) => {
    if (p.dataset.panel === tab) p.classList.add('ck-tab-active');
    else p.classList.remove('ck-tab-active');
  });
}

abItems.forEach((item: any) => {
  item.addEventListener('click', () => {
    const tab = item.dataset.tab;
    const isCollapsed = sidebar && sidebar.classList.contains('ck-collapsed');
    const isActive = item.classList.contains('ck-ab-active');
    const run = () => { const f = tabLoaders[tab]; if (f) { try { f(); } catch (_) { /* ignore */ } } };
    // 收起状态下点图标 → 展开并切到该标签
    if (isCollapsed) {
      setCollapsed(false);
      activateTab(item, tab);
      run();
      return;
    }
    // 点"已激活"的图标 → 收起（VS Code 行为）
    if (isActive) { setCollapsed(true); return; }
    // 否则：切到该标签
    activateTab(item, tab);
    run();
  });
});
