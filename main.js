const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { exec } = require('child_process');
const path = require('path');

let mainWindow = null;

// 危险命令列表 —— 匹配到的命令会额外警告
const DANGEROUS_CMDS = [
  /^rm\s+-rf\s+\//i,
  /^format\s+/i,
  /^del\s+\/f/i,
  /^rd\s+\/s/i,
  /^shutdown\s+/i,
  /^taskkill\s+/i,
  /^diskpart/i,
  /^reg\s+delete/i,
  /^cipher\s+\/w/i,
];

function isDangerous(cmd) {
  return DANGEROUS_CMDS.some((pattern) => pattern.test(cmd.trim()));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    title: 'Cuckoo AI Pro - DeepSeek CMD',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 需要访问 Node.js API
    },
  });

  // 设置 User-Agent，避免被识别为自动化工具
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  mainWindow.webContents.setUserAgent(userAgent);

  // 加载 DeepSeek
  mainWindow.loadURL('https://chat.deepseek.com/');

  // 页面加载完成后通知渲染进程
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('page-loaded');
    }
  });

  // F12 打开 DevTools
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ========== IPC 处理器 ==========

// 执行命令
ipcMain.handle('execute-command', async (_event, { command, id }) => {
  if (!command || typeof command !== 'string') {
    return { id, success: false, error: '无效的命令' };
  }

  const trimmed = command.trim();
  if (!trimmed) {
    return { id, success: false, error: '命令为空' };
  }

  // 步骤 1: 弹出确认对话框
  const dangerWarning = isDangerous(trimmed)
    ? '\n\n⚠️ 警告：此命令可能存在风险，请谨慎确认！'
    : '';

  const result = await dialog.showMessageBox(mainWindow, {
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

  // 步骤 2: 执行命令
  return new Promise((resolve) => {
    const child = exec(
      trimmed,
      {
        cwd: process.env.USERPROFILE || 'C:\\',
        timeout: 30000, // 30 秒超时
        maxBuffer: 1024 * 1024, // 1MB 输出缓冲
      },
      (error, stdout, stderr) => {
        resolve({
          id,
          success: !error,
          stdout: stdout || '',
          stderr: stderr || '',
          error: error ? error.message : null,
        });
      }
    );
  });
});

// ========== 应用生命周期 ==========

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});