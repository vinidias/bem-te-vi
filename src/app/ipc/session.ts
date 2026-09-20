/**
 * IPC：会话列表与导航
 */
import { createRequire } from 'node:module';
import * as windowState from '../window.js';
import { getProviderByUrl } from '../../providers/registry.js';

const require = createRequire(import.meta.url);
const { ipcMain } = require('electron');

function registerSessionIpc(): void {
  // 列出会话
  ipcMain.handle('list-sessions', async (event: any) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const store = ctx ? ctx.sessionStore : null;
    if (!store || !store.state.selectedProjectDir) {
      return { success: true, sessions: [] };
    }
    const all = store.readSessionStore();
    const sessions = Object.keys(all).filter(id => all[id] === store.state.selectedProjectDir);
    return { success: true, sessions };
  });

  // 导航到会话
  ipcMain.handle('navigate-session', async (event: any, { sessionId }: any) => {
    if (!sessionId) return { success: false, error: '缺少会话ID' };
    const ctx = windowState.getContextByWebContents(event.sender);
    const view = ctx ? ctx.view : null;
    if (!view || !view.webContents || view.webContents.isDestroyed()) {
      return { success: false, error: '窗口已关闭' };
    }
    // 按当前 provider 拼会话 URL（智谱 cid=、DeepSeek /chat/s/、Claude /chat/）
    let url = null;
    try {
      const provider = getProviderByUrl(view.webContents.getURL());
      if (provider && typeof provider.sessionUrlBase === 'string' && provider.sessionUrlBase) {
        url = provider.sessionUrlBase + sessionId;
      }
    } catch (_) { /* provider 未识别 */ }
    if (!url) return { success: false, error: '无法确定会话 URL（当前平台未提供 sessionUrlBase）' };
    try {
      await view.webContents.loadURL(url);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}

export { registerSessionIpc };
