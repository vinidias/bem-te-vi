/**
 * 会话-目录映射持久化存储 + URL 会话检测
 * 由原 main.js 拆分而来，逻辑保持不变。
 */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const windowState = require('./window');

// ========== 会话-目录映射持久化存储 ==========

// 注意：STORE_FILE 在模块加载时即按默认 userData 路径计算（先于 index.js 中的
// app.setPath('userData', ...) 执行）。这是历史行为 —— 既有用户的映射文件位于
// 默认 userData 目录（%APPDATA%/cuckoo-code/session-dir-map.json），
// 请勿调整计算时机，否则既有用户的会话-目录绑定会丢失。
const STORE_FILE = path.join(app.getPath('userData'), 'session-dir-map.json');

/**
 * 读取存储的会话-目录映射
 */
function readSessionStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = fs.readFileSync(STORE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[Cuckoo Code] 读取会话存储失败:', err.message);
  }
  return {};
}

/**
 * 写入会话-目录映射
 */
function writeSessionStore(store) {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
    console.log('[Cuckoo Code] 会话存储已保存');
  } catch (err) {
    console.error('[Cuckoo Code] 写入会话存储失败:', err.message);
  }
}

/**
 * 根据会话ID获取项目目录
 */
function getProjectDirBySessionId(sessionId) {
  if (!sessionId) return null;
  const store = readSessionStore();
  return store[sessionId] || null;
}

/**
 * 保存会话ID与项目目录的映射
 */
function saveSessionDirMapping(sessionId, projectDir) {
  if (!sessionId) return;
  const store = readSessionStore();
  store[sessionId] = projectDir;
  writeSessionStore(store);
}

/**
 * 从URL中提取会话ID
 * 示例: https://chat.deepseek.com/a/chat/s/bd9953b8-ff70-4207-9a12-5967be02a066
 * 返回 bd9953b8-ff70-4207-9a12-5967be02a066
 */
function extractSessionIdFromUrl(url) {
  if (!url) return null;
  // 匹配 /chat/s/ 后面的 UUID（更鲁棒，支持任意前缀）
  const match = url.match(/\/chat\/s\/([a-f0-9-]+)/i);
  if (match) return match[1];
  // 备选：匹配 /s/ 后面的 UUID（有些情况下路径可能不同）
  const altMatch = url.match(/\/s\/([a-f0-9-]+)/i);
  return altMatch ? altMatch[1] : null;
}

// 会话相关内存状态（原 main.js 中的模块级变量）
const state = {
  // 当前会话ID（从页面URL中提取）
  currentSessionId: null,
  // 当前选中的项目目录（内存缓存）
  selectedProjectDir: null,
  // 待绑定的项目目录（当初始化时还未获取到sessionId时暂存）
  pendingProjectDir: null,
};

/**
 * 处理URL变化：提取会话ID，并尝试恢复项目目录
 */
function handleUrlChange(url) {
  const sessionId = extractSessionIdFromUrl(url);
  if (sessionId) {
    state.currentSessionId = sessionId;
    console.log(`[Cuckoo Code] 当前会话ID: ${sessionId}`);

    // 检查是否有暂存的项目目录需要绑定到当前会话
    if (state.pendingProjectDir) {
      console.log(`[Cuckoo Code] 发现暂存项目目录 ${state.pendingProjectDir}，立即绑定到会话 ${sessionId}`);
      saveSessionDirMapping(sessionId, state.pendingProjectDir);
      state.selectedProjectDir = state.pendingProjectDir;
      state.pendingProjectDir = null;
      const mainWindow = windowState.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('project-dir-updated', state.selectedProjectDir);
        mainWindow.webContents.send('session-restored', { sessionId, projectDir: state.selectedProjectDir });
      }
      console.log(`[Cuckoo Code] 暂存目录已绑定到会话 ${sessionId}`);
      return;
    }

    // 尝试从存储中恢复项目目录
    const restoredDir = getProjectDirBySessionId(sessionId);
    if (restoredDir) {
      state.selectedProjectDir = restoredDir;
      console.log(`[Cuckoo Code] 已恢复项目目录: ${restoredDir}`);
      // 通知渲染进程恢复成功
      const mainWindow = windowState.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('session-restored', { sessionId, projectDir: restoredDir });
        // 发送目录更新事件，更新UI显示
        mainWindow.webContents.send('project-dir-updated', restoredDir);
      }
    } else {
      console.log(`[Cuckoo Code] 会话 ${sessionId} 未找到关联的项目目录`);
      // 清空当前目录
      state.selectedProjectDir = null;
      const mainWindow = windowState.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        // 发送空目录事件，更新UI显示为“未选择”
        mainWindow.webContents.send('project-dir-updated', null);
      }
    }
  } else {
    // 非会话页面（如首页），清空状态
    state.currentSessionId = null;
    state.selectedProjectDir = null;
    console.log('[Cuckoo Code] 未检测到会话ID，已清空项目目录');
    const mainWindow = windowState.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project-dir-updated', null);
    }
  }
}

/**
 * 尝试从当前URL恢复会话和项目目录（在页面加载完成后调用）
 */
function tryRestoreSessionFromUrl() {
  const mainWindow = windowState.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const url = mainWindow.webContents.getURL();
  console.log('[Cuckoo Code] 尝试恢复会话，当前URL:', url);
  handleUrlChange(url);
}

module.exports = {
  readSessionStore,
  writeSessionStore,
  getProjectDirBySessionId,
  saveSessionDirMapping,
  extractSessionIdFromUrl,
  handleUrlChange,
  tryRestoreSessionFromUrl,
  state,
};
