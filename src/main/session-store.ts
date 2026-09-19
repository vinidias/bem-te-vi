/**
 * 会话-目录映射持久化存储 + URL 会话检测（每 profile 独立实例）
 * 由原 session-store.js 改造：从单例改为工厂函数，每个 profile 拥有独立存储文件和状态。
 */
import fs from 'node:fs';
import path from 'node:path';
import { getProviderByUrl } from '../providers/index.js';

/**
 * 创建 profile 专属的 session store 实例
 * @param profileId profile id
 * @param storeDir 存储目录（通常是 userData）
 * @param windowState window 管理模块引用
 */
function createSessionStore(profileId: string, storeDir: string, windowState: any): any {
  const STORE_FILE = path.join(storeDir, 'session-dir-map-' + profileId + '.json');

  function readSessionStore(): any {
    try {
      if (fs.existsSync(STORE_FILE)) {
        return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
      }
    } catch (err: any) {
      console.error('[Cuckoo Code] 读取会话存储失败:', err.message);
    }
    return {};
  }

  function writeSessionStore(store: any): void {
    try {
      fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
      console.log('[Cuckoo Code] 会话存储已保存:', STORE_FILE);
    } catch (err: any) {
      console.error('[Cuckoo Code] 写入会话存储失败:', err.message);
    }
  }

  function getProjectDirBySessionId(sessionId: string): any {
    if (!sessionId) return null;
    const store = readSessionStore();
    return store[sessionId] || null;
  }

  function saveSessionDirMapping(sessionId: string, projectDir: any): void {
    if (!sessionId) return;
    const store = readSessionStore();
    store[sessionId] = projectDir;
    writeSessionStore(store);
  }

  function extractSessionIdFromUrl(url: string): string | null {
    if (!url) return null;
    // 平台差异全部下沉到 provider.extractSessionId
    try {
      const provider = getProviderByUrl(url);
      if (provider && typeof provider.extractSessionId === 'function') {
        return provider.extractSessionId(url);
      }
    } catch (_) { /* provider 异常时返回 null */ }
    return null;
  }

  const state: any = {
    currentSessionId: null,
    selectedProjectDir: null,
    pendingProjectDir: null,
  };

  function handleUrlChange(url: string, targetWindow?: any): void {
    const sessionId = extractSessionIdFromUrl(url);
    const win = targetWindow || (windowState && windowState.getMainWindow());

    if (sessionId) {
      state.currentSessionId = sessionId;
      console.log('[Cuckoo Code][' + profileId + '] 当前会话ID: ' + sessionId);

      if (state.pendingProjectDir) {
        saveSessionDirMapping(sessionId, state.pendingProjectDir);
        state.selectedProjectDir = state.pendingProjectDir;
        state.pendingProjectDir = null;
        if (win && !win.isDestroyed()) {
          win.webContents.send('project-dir-updated', state.selectedProjectDir);
          win.webContents.send('session-restored', { sessionId, projectDir: state.selectedProjectDir });
        }
        console.log('[Cuckoo Code][' + profileId + '] 暂存目录已绑定');
        return;
      }

      const restoredDir = getProjectDirBySessionId(sessionId);
      if (restoredDir) {
        state.selectedProjectDir = restoredDir;
        if (win && !win.isDestroyed()) {
          win.webContents.send('session-restored', { sessionId, projectDir: restoredDir });
          win.webContents.send('project-dir-updated', restoredDir);
        }
      } else {
        state.selectedProjectDir = null;
        if (win && !win.isDestroyed()) {
          win.webContents.send('project-dir-updated', null);
        }
      }
    } else {
      // 提取不到会话 ID（如 ChatGPT 首页 https://chatgpt.com/）：
      // 若有暂存目录（刚初始化但还没绑定会话），保留目录；否则清空（恢复原行为）。
      state.currentSessionId = null;
      if (!state.pendingProjectDir) {
        state.selectedProjectDir = null;
        if (win && !win.isDestroyed()) {
          win.webContents.send('project-dir-updated', null);
        }
      }
    }
  }

  function tryRestoreSessionFromUrl(targetWindow?: any): void {
    const win = targetWindow || (windowState && windowState.getMainWindow());
    if (!win || win.isDestroyed()) return;
    const url = win.webContents.getURL();
    handleUrlChange(url, win);
  }

  return {
    readSessionStore,
    writeSessionStore,
    getProjectDirBySessionId,
    saveSessionDirMapping,
    extractSessionIdFromUrl,
    handleUrlChange,
    tryRestoreSessionFromUrl,
    state,
  };
}

export { createSessionStore };
