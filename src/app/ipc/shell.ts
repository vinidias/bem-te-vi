/**
 * IPC：地址栏壳页面（shell）的导航控制
 * 壳页面通过 window.shellAPI 调用这些通道操作下方 WebContentsView 中的 AI 页面。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as windowState from '../window.js';
import { getProvider } from '../../providers/registry.js';
import { setWindowCumulative, getTotal, cleanupSubagentKeys } from '../token-stats.js';
import { resolveAsset, resolveSrc } from '../../infra/paths.js';
import * as updater from '../../updater/index.js';

const require = createRequire(import.meta.url);
const { ipcMain, app, shell, BrowserWindow } = require('electron');

/** 取事件来源对应的 AI 页面 view */
function viewOf(event: any): any {
  return windowState.getViewByWebContents(event.sender);
}

/** 把当前 URL 与前进/后退可用状态推送给壳页面 */
function pushUrlState(view: any): void {
  if (!view || !view.webContents || view.webContents.isDestroyed()) return;
  const wc = view.webContents;
  const ctx = windowState.getContextByWebContents(wc);
  if (!ctx || !ctx.win || ctx.win.isDestroyed()) return;
  const history = wc.navigationHistory;
  ctx.win.webContents.send('shell-url-updated', {
    url: wc.getURL(),
    canGoBack: history ? history.canGoBack() : false,
    canGoForward: history ? history.canGoForward() : false,
  });
}

/** 把系统总累计广播给所有窗口的壳页面 */
function broadcastSystemTotal(): void {
  const total = getTotal();
  for (const ctx of windowState.getAllContexts()) {
    try {
      if (ctx && ctx.win && !ctx.win.isDestroyed()) {
        ctx.win.webContents.send('shell-total-updated', { systemTotal: total });
      }
    } catch (_) {}
  }
}

/** 把项目目录推送给壳页面（地址栏最左） */
function pushProjectDir(view: any, dir: string | null): void {
  const ctx = view ? windowState.getContextByWebContents(view.webContents) : null;
  if (!ctx || !ctx.win || ctx.win.isDestroyed()) return;
  ctx.win.webContents.send('shell-project-dir', dir || null);
}

/** 把 token 数据推送给壳页面的状态条 */
function pushTokenUsage(view: any, context: number, cumulative: number, windowCumulative = 0, todayCumulative = 0, daily: any = null): void {
  const ctx = view ? windowState.getContextByWebContents(view.webContents) : null;
  if (!ctx || !ctx.win || ctx.win.isDestroyed()) return;
  ctx.win.webContents.send('shell-token-updated', { context, cumulative, windowCumulative, todayCumulative, daily });
}

function registerShellIpc(): void {
  // 启动时清理子代理遗留的 token 统计键（历史 bug：子代理上报污染系统总累计）
  try { cleanupSubagentKeys(); } catch (_) { /* ignore */ }
  // AI 页面报告 token（上下文 + 对话累计 + 窗口累计 + 今日累计）→ 转发给壳页面状态条
  ipcMain.handle('update-token-usage', async (event: any, { context, cumulative, windowCumulative, todayCumulative, daily }: any) => {
    const view = viewOf(event);
    if (view && typeof context === 'number') {
      pushTokenUsage(
        view,
        context,
        typeof cumulative === 'number' ? cumulative : 0,
        typeof windowCumulative === 'number' ? windowCumulative : 0,
        typeof todayCumulative === 'number' ? todayCumulative : 0,
        Array.isArray(daily) ? daily : null
      );
    }
    // 更新系统总累计并广播给所有窗口
    try {
      const ctx = view ? windowState.getContextByWebContents(view.webContents) : null;
      // 子代理与父窗口共用 profileId，写入的是同一个键（幂等，不会重复累计）。
      if (ctx && ctx.profileId && typeof windowCumulative === 'number') {
        setWindowCumulative(ctx.profileId, windowCumulative);
        broadcastSystemTotal();
      }
    } catch (_) {}
    return { success: true };
  });

  // 查询当前系统总累计（壳页面加载时拉取一次）
  ipcMain.handle('get-system-total', async () => {
    return { success: true, systemTotal: getTotal() };
  });


  ipcMain.handle('shell-navigate', async (event: any, { url }: any) => {
    const view = viewOf(event);
    if (!view || !url) return { success: false };
    try {
      await view.webContents.loadURL(url);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('shell-back', async (event: any) => {
    const view = viewOf(event);
    if (view && view.webContents.navigationHistory.canGoBack()) {
      view.webContents.navigationHistory.goBack();
    }
    return { success: true };
  });

  ipcMain.handle('shell-forward', async (event: any) => {
    const view = viewOf(event);
    if (view && view.webContents.navigationHistory.canGoForward()) {
      view.webContents.navigationHistory.goForward();
    }
    return { success: true };
  });

  ipcMain.handle('shell-reload', async (event: any) => {
    const view = viewOf(event);
    if (view) view.webContents.reload();
    return { success: true };
  });

  ipcMain.handle('shell-home', async (event: any) => {
    const view = viewOf(event);
    if (!view) return { success: false };
    const ctx = windowState.getContextByWebContents(view.webContents);
    if (!ctx || !ctx.providerId) return { success: false };
    const provider = getProvider(ctx.providerId);
    if (!provider) return { success: false };
    try {
      await view.webContents.loadURL(provider.homeUrl);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 应用信息（关于页：版本号）
  ipcMain.handle('get-app-info', async () => {
    let version = '';
    try { version = app.getVersion(); } catch (_) {}
    return { success: true, version };
  });

  // 打开外部链接（关于页：GitHub 源码地址）
  ipcMain.handle('open-external', async (_event: any, { url }: any) => {
    try {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { success: false };
      await shell.openExternal(url);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 打开「飞书配置教程」应用内新窗口（自包含 HTML，离线可用）
  ipcMain.handle('open-feishu-setup', async () => {
    try {
      const htmlPath = resolveSrc('ui/feishu-setup.html');
      const win = new BrowserWindow({
        width: 900,
        height: 820,
        title: '飞书同步配置教程',
        backgroundColor: '#16181d',
        autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      win.loadFile(htmlPath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 检查更新（关于页按钮）
  ipcMain.handle('check-update', async () => {
    try {
      await updater.checkForUpdates();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 取 assets 图片的 file:// URL（关于页 QQ 群图片）
  ipcMain.handle('get-asset-url', async (_event: any, { rel }: any) => {
    try {
      if (typeof rel !== 'string' || !rel) return { success: false };
      const abs = resolveAsset(rel);
      return { success: true, url: pathToFileURL(abs).href };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 查询当前项目目录（壳页面加载时拉取一次）
  ipcMain.handle('get-project-dir', async (event: any) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const dir = (ctx && ctx.sessionStore && ctx.sessionStore.state && ctx.sessionStore.state.selectedProjectDir) || null;
    return { success: true, dir };
  });

  // 壳页面上报真实可视尺寸 → 记录并重新布局（修正 Windows 菜单栏导致的高度误差）
  ipcMain.on('shell-report-size', (event: any, { w, h }: any) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.win || ctx.win.isDestroyed()) return;
    const win = ctx.win;
    if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) {
      win.__ckShellWidth = w;
      win.__ckShellHeight = h;
      try { if (typeof win.__ckLayout === 'function') win.__ckLayout(); } catch (_) {}
    }
  });

  // 切换纯净对话模式（Harness）：壳页面「纯净模式/原版模式」按钮调用
  ipcMain.handle('shell-toggle-harness', async (event: any) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.win || ctx.win.isDestroyed()) return { success: false };
    const win = ctx.win;
    try { win.__ckToggleHarness?.(); } catch (_) { /* ignore */ }
    return { success: true, harness: !!win.__ckHarnessVisible };
  });

  // ===== 侧边栏拖拽调宽 =====
  // 拖拽时把 AI 视图移出（宽0），鼠标事件全落壳页面；主进程轮询鼠标位置算宽度并推回。
  // 松开后恢复 AI 视图。
  ipcMain.on('shell-sidebar-drag-start', (event: any) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.win || ctx.win.isDestroyed()) return;
    const win = ctx.win;
    const view = ctx.view;
    if (win.__ckSidebarDragging) return;
    win.__ckSidebarDragging = true;
    // 移出 AI 视图 + harness 视图（避免鼠标被它们捕获）
    try { if (view && !view.webContents.isDestroyed()) view.setBounds({ x: 0, y: 0, width: 0, height: 0 }); } catch (_) {}
    try {
      const hv = win.__ckHarnessView;
      if (hv && !hv.webContents.isDestroyed()) hv.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    } catch (_) {}
    const { screen } = require('electron');
    const base = ctx.win.getContentBounds(); // 窗口内容区（屏幕坐标）
    const minW = 320;
    win.__ckSidebarDragTimer = setInterval(() => {
      try {
        if (!win || win.isDestroyed()) return;
        const pt = screen.getCursorScreenPoint();
        let w = Math.round(pt.x - base.x);
        if (w < minW) w = minW;
        win.__ckSidebarDragWidth = w;
        if (!win.webContents.isDestroyed()) win.webContents.send('shell-sidebar-drag', w);
      } catch (_) { /* ignore */ }
    }, 16);
  });

  ipcMain.on('shell-sidebar-drag-end', (event: any) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.win || ctx.win.isDestroyed()) return;
    const win = ctx.win;
    if (!win.__ckSidebarDragging) return;
    win.__ckSidebarDragging = false;
    if (win.__ckSidebarDragTimer) { clearInterval(win.__ckSidebarDragTimer); win.__ckSidebarDragTimer = null; }
    const w = win.__ckSidebarDragWidth;
    if (typeof w === 'number') win.__ckSidebarWidth = w;
    // 恢复 AI 视图（按新宽度重排）
    try { if (typeof win.__ckLayout === 'function') win.__ckLayout(); } catch (_) {}
    // 通知壳页面最终宽度（确保一致）
    try { if (!win.webContents.isDestroyed()) win.webContents.send('shell-sidebar-drag', win.__ckSidebarWidth); } catch (_) {}
  });

  // 设置左侧 Cuckoo 侧边栏宽度（收起=46，展开=320）→ 重新布局 AI 页面
  ipcMain.handle('shell-toggle-sidebar', async (event: any, { width }: any) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.win || ctx.win.isDestroyed()) return { success: false };
    const win = ctx.win;
    win.__ckSidebarWidth = typeof width === 'number' ? width : 320;
    try { if (typeof win.__ckLayout === 'function') win.__ckLayout(); } catch (_) {}
    return { success: true };
  });
}

export { registerShellIpc, pushUrlState, pushTokenUsage, pushProjectDir };
