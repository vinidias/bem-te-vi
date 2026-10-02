/**
 * 会话-目录映射持久化存储 + URL 会话检测（每 profile 独立实例）
 * 由原 session-store.js 改造：从单例改为工厂函数，每个 profile 拥有独立存储文件和状态。
 */
import fs from 'node:fs';
import path from 'node:path';
import { getProviderByUrl } from '../providers/registry.js';

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

  /**
   * 取会话元数据（统一为对象结构）。
   * 兼容旧格式（值直接是 projectDir 字符串）→ 归一化为 { projectDir }。
   */
  function getSessionMeta(sessionId: string): any {
    if (!sessionId) return null;
    const store = readSessionStore();
    const v = store[sessionId];
    if (v == null) return null;
    if (typeof v === 'string') return { projectDir: v, title: null, createdAt: null, updatedAt: null, archived: false };
    return {
      projectDir: v.projectDir || null,
      title: v.title || null,
      createdAt: v.createdAt || null,
      updatedAt: v.updatedAt || null,
      archived: v.archived === true,
    };
  }

  function getProjectDirBySessionId(sessionId: string): any {
    const meta = getSessionMeta(sessionId);
    return meta ? meta.projectDir : null;
  }

  /**
   * 保存/更新"会话 → 项目目录"映射。
   * 新结构：{ projectDir, title, createdAt, updatedAt }。
   * 兼容旧数据：若旧值是字符串，就地升级为对象（createdAt 保持 null，不补记时间）。
   */
  function saveSessionDirMapping(sessionId: string, projectDir: any): void {
    if (!sessionId) return;
    const store = readSessionStore();
    const old = store[sessionId];
    const now = new Date().toISOString();
    if (old == null) {
      // 新会话：记录创建/更新时间
      store[sessionId] = { projectDir, title: null, createdAt: now, updatedAt: now };
    } else if (typeof old === 'string') {
      // 旧数据升级：不补记时间（老数据不记录时间）
      store[sessionId] = { projectDir, title: null, createdAt: null, updatedAt: null };
    } else {
      old.projectDir = projectDir;
      // 仅"新数据"（已有 createdAt）更新时间；老数据升级来的保持无时间
      if (old.createdAt != null) old.updatedAt = now;
      store[sessionId] = old;
    }
    writeSessionStore(store);
  }

  /** 项目归档：特殊 key 存在同一文件（值是目录字符串数组） */
  const PROJECT_ARCHIVES_KEY = '_archivedProjects';

  /** 取已归档的项目目录列表 */
  function getArchivedProjects(): string[] {
    const store = readSessionStore();
    const arr = store[PROJECT_ARCHIVES_KEY];
    return Array.isArray(arr) ? arr.filter((x: any) => typeof x === 'string') : [];
  }

  /** 归档/取消归档项目 */
  function setProjectArchived(dir: string, archived: boolean): void {
    if (!dir) return;
    const store = readSessionStore();
    let arr: string[] = Array.isArray(store[PROJECT_ARCHIVES_KEY]) ? store[PROJECT_ARCHIVES_KEY] : [];
    if (archived) {
      if (!arr.includes(dir)) arr.push(dir);
    } else {
      arr = arr.filter((d) => d !== dir);
    }
    store[PROJECT_ARCHIVES_KEY] = arr;
    writeSessionStore(store);
  }

  /** 归档/取消归档会话 */
  function setSessionArchived(sessionId: string, archived: boolean): void {
    if (!sessionId) return;
    const store = readSessionStore();
    const old = store[sessionId];
    if (old == null) return;
    if (typeof old === 'string') {
      store[sessionId] = { projectDir: old, title: null, createdAt: null, updatedAt: null, archived: archived === true };
    } else {
      old.archived = archived === true;
      store[sessionId] = old;
    }
    writeSessionStore(store);
  }

  /** 更新会话标题（AI 命名对话 / 网页标题抓取）。条目不存在时新建。 */
  function updateSessionTitle(sessionId: string, title: string): void {
    if (!sessionId || !title) return;
    const store = readSessionStore();
    const old = store[sessionId];
    const now = new Date().toISOString();
    if (old == null) {
      store[sessionId] = { projectDir: state.selectedProjectDir || null, title, createdAt: now, updatedAt: now };
    } else if (typeof old === 'string') {
      // 老数据升级：不补记时间（与 saveSessionDirMapping 一致）
      store[sessionId] = { projectDir: old, title, createdAt: null, updatedAt: null };
    } else {
      old.title = title;
      // 仅"新数据"更新时间；老数据升级来的保持无时间
      if (old.createdAt != null) old.updatedAt = now;
      store[sessionId] = old;
    }
    writeSessionStore(store);
  }

  /**
   * 设置当前会话标题。
   * 若尚无会话 ID（新对话首条消息还没生成 URL），先暂存，等会话 ID 出现后自动绑定。
   */
  function setSessionTitle(title: string): any {
    const t = String(title || '').trim();
    if (!t) return { success: false, error: '标题为空' };
    if (state.currentSessionId) {
      updateSessionTitle(state.currentSessionId, t);
      return { success: true };
    }
    state.pendingTitle = t;
    console.log('[Cuckoo Code][' + profileId + '] 暂存对话标题，等待会话ID出现后绑定: ' + t);
    return { success: true, pending: true };
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
    pendingTitle: null,
  };

  /** 取目标 view：显式传入优先，否则取当前主窗口的 AI 页面 view */
  function resolveView(targetView?: any): any {
    if (targetView) return targetView;
    const ctx = windowState && windowState.getMainContext ? windowState.getMainContext() : null;
    return ctx ? ctx.view : null;
  }

  /** 发"项目目录变化"：给 AI 页面 + 壳页面（地址栏） */
  function emitProjectDir(wc: any, dir: string | null): void {
    if (!wc || wc.isDestroyed()) return;
    wc.send('project-dir-updated', dir);
    try {
      const ctx = windowState && windowState.getContextByWebContents ? windowState.getContextByWebContents(wc) : null;
      if (ctx && ctx.win && !ctx.win.isDestroyed()) {
        ctx.win.webContents.send('shell-project-dir', dir);
      }
    } catch (_) { /* ignore */ }
  }

  function handleUrlChange(url: string, targetView?: any): void {
    const sessionId = extractSessionIdFromUrl(url);
    const view = resolveView(targetView);
    const wc = view && view.webContents ? view.webContents : null;
    const canSend = wc && !wc.isDestroyed();

    if (sessionId) {
      state.currentSessionId = sessionId;
      console.log('[Cuckoo Code][' + profileId + '] 当前会话ID: ' + sessionId);

      // 会话 ID 出现 → 绑定暂存的对话标题（AI 命名可能在首条消息时就调用）
      if (state.pendingTitle) {
        updateSessionTitle(sessionId, state.pendingTitle);
        state.pendingTitle = null;
        try {
          const ctx = windowState && windowState.getContextByWebContents ? windowState.getContextByWebContents(wc) : null;
          if (ctx && ctx.win && !ctx.win.isDestroyed()) ctx.win.webContents.send('shell-sessions-changed');
        } catch (_) { /* ignore */ }
      }

      if (state.pendingProjectDir) {
        saveSessionDirMapping(sessionId, state.pendingProjectDir);
        state.selectedProjectDir = state.pendingProjectDir;
        state.pendingProjectDir = null;
        if (canSend) {
          emitProjectDir(wc, state.selectedProjectDir);
          wc.send('session-restored', { sessionId, projectDir: state.selectedProjectDir });
        }
        console.log('[Cuckoo Code][' + profileId + '] 暂存目录已绑定');
        return;
      }

      const restoredDir = getProjectDirBySessionId(sessionId);
      if (restoredDir) {
        state.selectedProjectDir = restoredDir;
        if (canSend) {
          wc.send('session-restored', { sessionId, projectDir: restoredDir });
          emitProjectDir(wc, restoredDir);
        }
      } else {
        state.selectedProjectDir = null;
        if (canSend) emitProjectDir(wc, null);
      }
    } else {
      // 提取不到会话 ID（如 ChatGPT 首页 https://chatgpt.com/）：
      // 若有暂存目录（刚初始化但还没绑定会话），保留目录；否则清空（恢复原行为）。
      state.currentSessionId = null;
      if (!state.pendingProjectDir) {
        state.selectedProjectDir = null;
        if (canSend) emitProjectDir(wc, null);
      }
    }
  }

  function tryRestoreSessionFromUrl(targetView?: any): void {
    const view = resolveView(targetView);
    if (!view || !view.webContents || view.webContents.isDestroyed()) return;
    const url = view.webContents.getURL();
    handleUrlChange(url, view);
  }

  return {
    readSessionStore,
    writeSessionStore,
    getSessionMeta,
    getProjectDirBySessionId,
    saveSessionDirMapping,
    updateSessionTitle,
    setSessionTitle,
    setSessionArchived,
    getArchivedProjects,
    setProjectArchived,
    extractSessionIdFromUrl,
    handleUrlChange,
    tryRestoreSessionFromUrl,
    state,
  };
}

export { createSessionStore };
