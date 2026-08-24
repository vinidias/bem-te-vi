/**
 * IPC 处理器注册（渲染进程 → 主进程）
 * 由原 main.js 拆分而来，通道名与行为保持不变。
 */
const { app, dialog, ipcMain } = require('electron');
const { exec } = require('child_process');

const windowState = require('./window');
const sessionStore = require('./session-store');
const { toolRegistry, jsRunner } = require('./tool-registry');
const { initProject } = require('./project-context');
const { isDangerous } = require('./dangerous-commands');
const { decodeOutput, normalizeCommand } = require('../../tools/decodeOutput');

function registerIpcHandlers() {
  // 初始化项目：选择目录并发送目录树 + systemPrompt
  ipcMain.handle('init-project', async (_event, { skipPrompt = false } = {}) => {
    return initProject(skipPrompt);
  });

  // 列出当前项目目录关联的所有会话ID
  ipcMain.handle('list-sessions', async () => {
    if (!sessionStore.state.selectedProjectDir) {
      return { success: true, sessions: [] };
    }
    const store = sessionStore.readSessionStore();
    const sessions = Object.keys(store).filter(sessionId => store[sessionId] === sessionStore.state.selectedProjectDir);
    console.log(`[Cuckoo Code] 列出会话，项目目录 ${sessionStore.state.selectedProjectDir} 关联 ${sessions.length} 个会话`);
    return { success: true, sessions };
  });

  // 导航到指定会话
  ipcMain.handle('navigate-session', async (_event, { sessionId }) => {
    if (!sessionId) {
      return { success: false, error: '缺少会话ID' };
    }
    const mainWindow = windowState.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, error: '主窗口已关闭' };
    }
    const url = `https://chat.deepseek.com/a/chat/s/${sessionId}`;
    console.log(`[Cuckoo Code] 导航到会话: ${url}`);
    try {
      await mainWindow.webContents.loadURL(url);
      return { success: true };
    } catch (err) {
      console.error('[Cuckoo Code] 导航失败:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 执行命令
  ipcMain.handle('execute-command', async (_event, { command, id }) => {
    if (!command || typeof command !== 'string') {
      return { id, success: false, error: '无效的命令' };
    }

    const trimmed = normalizeCommand(command.trim());
    if (!trimmed) {
      return { id, success: false, error: '命令为空' };
    }

    // 步骤 1: 弹出确认对话框
    const dangerWarning = isDangerous(trimmed)
      ? '\n\n⚠️ 警告：此命令可能存在风险，请谨慎确认！'
      : '';

    const result = await dialog.showMessageBox(windowState.getMainWindow(), {
      type: isDangerous(trimmed) ? 'warning' : 'question',
      buttons: ['取消', '确认执行'],
      defaultId: 0,
      cancelId: 0,
      title: '确认执行命令',
      message: '将执行以下命令：',
      detail: `${trimmed}${dangerWarning}`,
    });

    if (result.response !== 1) {
      return { id, success: false, error: '用户取消了执行', canceled: true };
    }

    // 步骤 2: 执行命令（encoding: 'buffer' + 智能解码，避免中文 GBK 乱码）
    return new Promise((resolve) => {
      const child = exec(
        trimmed,
        {
          cwd: sessionStore.state.selectedProjectDir || process.env.USERPROFILE || app.getPath('home'),
          timeout: 30000, // 30 秒超时
          maxBuffer: 1024 * 1024, // 1MB 输出缓冲
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

  // ========== 工具执行 IPC ==========

  /**
   * 执行工具
   * 支持 AI 调用工具库中的工具
   */
  ipcMain.handle('execute-tool', async (_event, { toolName, params, callId }) => {
    console.log(`[Cuckoo Code] 执行工具: ${toolName}, projectDir=${sessionStore.state.selectedProjectDir || '(未初始化,相对路径将解析到系统目录)'}`, JSON.stringify(params));
    try {
      // 如果有选中的项目目录，将其作为工作目录传递给工具
      const paramsWithContext = {
        ...params,
        projectDir: sessionStore.state.selectedProjectDir
      };
      const result = await toolRegistry.execute(toolName, paramsWithContext);
      if (result.success) {
        console.log(`[Cuckoo Code] ✅ 工具 ${toolName} 执行成功:`, JSON.stringify(result.data));
      } else {
        console.log(`[Cuckoo Code] ❌ 工具 ${toolName} 执行失败:`, result.error);
      }
      return { callId, success: result.success, data: result.data, error: result.error };
    } catch (err) {
      console.error(`[Cuckoo Code] 工具 ${toolName} 执行异常:`, err);
      return { callId, success: false, error: err.message };
    }
  });

  // ========== JS 工具脚本执行 IPC ==========

  /**
   * 执行 AI 生成的 JS 工具代码
   * 代码在受限的 vm 沙箱中运行，只能调用注入的工具函数（readFile/writeFile/editFile/...）
   */
  ipcMain.handle('execute-js', async (_event, { code, callId }) => {
    const preview = String(code || '').replace(/\s+/g, ' ').slice(0, 200);
    console.log(`[Cuckoo Code] 执行 JS 工具脚本: ${preview}`);
    console.log('[Cuckoo Code] [诊断] 主进程收到的代码(JSON转义): ' + JSON.stringify(String(code || '')).slice(0, 2000));
    if (!code || typeof code !== 'string') {
      return { callId, success: false, error: '无效的 JS 代码' };
    }
    try {
      const result = await jsRunner.run(code, sessionStore.state.selectedProjectDir);
      if (result.success) {
        console.log('[Cuckoo Code] ✅ JS 工具脚本执行成功, 输出长度=' + ((result.output || '').length));
      } else {
        console.log('[Cuckoo Code] ❌ JS 工具脚本执行失败:', result.error);
      }
      return { callId, ...result };
    } catch (err) {
      console.error('[Cuckoo Code] JS 工具脚本执行异常:', err);
      return { callId, success: false, error: err.message };
    }
  });
}

module.exports = { registerIpcHandlers };
