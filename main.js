const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

// systemPrompt.md 路径
const SYSTEM_PROMPT_PATH = path.join(__dirname, 'systemPrompt.md');

// ========== 持久化会话配置 ==========

// 固定 userData 路径，确保 session 数据（cookies/localStorage 等）持久保存
const SESSION_DIR = 'cuckoo-ai-pro-session';
app.setPath('userData', path.join(app.getPath('appData'), SESSION_DIR));

console.log('[Cuckoo AI] Session 数据目录:', app.getPath('userData'));

/**
 * 递归获取目录树结构字符串
 * @param {string} dir 目录路径
 * @param {number} depth 当前深度
 * @returns {string} 目录树字符串
 */
function getDirectoryTree(dir, depth = 0) {
  const indent = '  '.repeat(depth);
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let tree = '';
    for (const entry of entries) {
      // 跳过隐藏文件和常见的不需要显示的目录
      if (entry.name.startsWith('.')) continue;
      tree += `${indent}${entry.name}${entry.isDirectory() ? '/' : ''}\n`;
      if (entry.isDirectory()) {
        tree += getDirectoryTree(path.join(dir, entry.name), depth + 1);
      }
    }
    return tree;
  } catch (err) {
    console.error('[Cuckoo AI] 读取目录失败:', err.message);
    return `[无法读取目录: ${dir: ${dir}]\n`;
  }
}

/**
 * 读取 systemPrompt.md 并与选定目录的树结构组合后发送到 preload
 */
function sendInitialPrompt() {
  // 先让用户选择目录
  const result = dialog.showOpenDialogSync(mainWindow, {
    properties: ['openDirectory'],
    buttonLabel: '选择目录',
    title: '请选择要分析的目录',
  });

  if (!result || result.length === 0) {
    console.log('[Cuckoo AI] 用户取消了目录选择');
    return;
  }

  const selectedDir = result[0];
  console.log('[Cuckoo AI] 用户选择目录:', selectedDir);

  // 生成目录树
  const tree = getDirectoryTree(selectedDir);
  // 读取系统提示词
  let promptContent = '';
  try {
    if (fs.existsSync(SYSTEM_PROMPT_PATH)) {
      promptContent = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
    } else {
      console.warn('[Cuckoo AI] systemPrompt.md 不存在');
    }
  } catch (err) {
    console.error('[Cuckoo AI] 读取 systemPrompt.md 失败:', err.message);
  }

  // 组合内容
  const combined = `我已选择目录：${selectedDir}
其目录结构如下：
${tree}
---
系统提示词：
${promptContent}`;

  console.log('[Cuckoo AI] 准备发送初始提示，长度:', combined.length);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('initial-prompt', combined);
  }
}

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

/**
 * 读取 systemPrompt.md 并发送到 preload
 */
function sendSystemPrompt() {
  try {
    if (fs.existsSync(SYSTEM_PROMPT_PATH)) {
      const content = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
      console.log('[Cuckoo AI] systemPrompt.md 已读取，长度:', content.length, '字节');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-prompt', content);
      }
    } else {
      console.log('[Cuckoo AI] systemPrompt.md 不存在，跳过');
    }
  } catch (err) {
    console.error('[Cuckoo AI] 读取 systemPrompt.md 失败:', err.message);
  }
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
      partition: 'persist:cuckoo-deepseek', // 持久化 session（cookies/localStorage）
    },
  });

  // 设置 User-Agent，避免被识别为自动化工具
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  mainWindow.webContents.setUserAgent(userAgent);

  // 加载 DeepSeek
  mainWindow.loadURL('https://chat.deepseek.com/');

  // 页面加载完成后通知渲染进程并发送初始提示（目录选择+systemPrompt）
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('page-loaded');
      sendInitialPrompt(); // 现在包含目录选择和systemPrompt
    }
  });

  // 当 webContents 销毁时停止监听
  mainWindow.webContents.on('will-destroy', () => {
    // cleanup if needed
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