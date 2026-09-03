/**
 * IPC 处理器注册（渲染进程 → 主进程）
 * 多窗口版：按 event.sender 路由到对应窗口的 profile 上下文。
 */
const { app, dialog, ipcMain, Notification } = require('electron');
const { exec } = require('child_process');

const windowState = require('./window');
const { toolRegistry, jsRunner } = require('./tool-registry');
const { initProject } = require('./project-context');
const { isDangerous } = require('./dangerous-commands');
const { decodeOutput, normalizeCommand } = require('../../tools/decodeOutput');

function registerIpcHandlers() {
  // 初始化项目
  ipcMain.handle('init-project', async (event, { skipPrompt = false } = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    return initProject(skipPrompt, ctx);
  });

  // 列出会话
  ipcMain.handle('list-sessions', async (event) => {
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
  ipcMain.handle('navigate-session', async (event, { sessionId }) => {
    if (!sessionId) return { success: false, error: '缺少会话ID' };
    const ctx = windowState.getContextByWebContents(event.sender);
    const win = ctx ? ctx.win : null;
    if (!win || win.isDestroyed()) return { success: false, error: '窗口已关闭' };
    const url = 'https://chat.deepseek.com/a/chat/s/' + sessionId;
    try {
      await win.webContents.loadURL(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 执行命令
  ipcMain.handle('execute-command', async (event, { command, id }) => {
    if (!command || typeof command !== 'string') {
      return { id, success: false, error: '无效的命令' };
    }
    const trimmed = normalizeCommand(command.trim());
    if (!trimmed) return { id, success: false, error: '命令为空' };

    const ctx = windowState.getContextByWebContents(event.sender);
    const win = ctx ? ctx.win : windowState.getMainWindow();
    const store = ctx ? ctx.sessionStore : null;
    const selectedDir = store ? store.state.selectedProjectDir : null;

    const dangerWarning = isDangerous(trimmed) ? '\n\n⚠️ 警告：此命令可能存在风险，请谨慎确认！' : '';
    const result = await dialog.showMessageBox(win, {
      type: isDangerous(trimmed) ? 'warning' : 'question',
      buttons: ['取消', '确认执行'],
      defaultId: 0,
      cancelId: 0,
      title: '确认执行命令',
      message: '将执行以下命令：',
      detail: trimmed + dangerWarning,
    });
    if (result.response !== 1) {
      return { id, success: false, error: '用户取消了执行', canceled: true };
    }
    return new Promise((resolve) => {
      const child = exec(
        trimmed,
        {
          cwd: selectedDir || process.env.USERPROFILE || app.getPath('home'),
          timeout: 30000,
          maxBuffer: 1024 * 1024,
          encoding: 'buffer',
        },
        (error, stdout, stderr) => {
          resolve({
            id,
            success: !error,
            stdout: decodeOutput(stdout),
            stderr: decodeOutput(stderr),
            error: error ? error.message : null,
          });
        }
      );
    });
  });

  // 执行工具
  ipcMain.handle('execute-tool', async (event, { toolName, params, callId }) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const store = ctx ? ctx.sessionStore : null;
    const selectedDir = store ? store.state.selectedProjectDir : null;
    try {
      const result = await toolRegistry.execute(toolName, { ...params, projectDir: selectedDir });
      return { callId, success: result.success, data: result.data, error: result.error };
    } catch (err) {
      return { callId, success: false, error: err.message };
    }
  });

  // 显示 AI 回复完成通知（弹通知 + 任务栏/Dock 吸引注意）
  ipcMain.handle('show-ai-notification', async (event, { title, body }) => {
    if (!title || !body) return { success: false, error: '通知内容缺失' };
    try {
      const notification = new Notification({ title, body });
      notification.show();

      const ctx = windowState.getContextByWebContents(event.sender);
      const win = ctx ? ctx.win : windowState.getMainWindow();
      if (win && !win.isDestroyed()) {
        win.flashFrame(true);
        win.once('focus', () => {
          if (!win.isDestroyed()) win.flashFrame(false);
        });
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 执行 JS 脚本
  ipcMain.handle('execute-js', async (event, { code, callId }) => {
    if (!code || typeof code !== 'string') {
      return { callId, success: false, error: '无效的 JS 代码' };
    }
    const ctx = windowState.getContextByWebContents(event.sender);
    const store = ctx ? ctx.sessionStore : null;
    const selectedDir = store ? store.state.selectedProjectDir : null;
    try {
      const result = await jsRunner.run(code, selectedDir);
      return { callId, ...result };
    } catch (err) {
      return { callId, success: false, error: err.message };
    }
  });
}

module.exports = { registerIpcHandlers };
