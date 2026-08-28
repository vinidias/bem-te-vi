/**
 * Cuckoo Code 主进程入口
 * 由项目根目录 main.js 薄壳加载。
 * 职责：应用生命周期、主窗口创建；其余职责分散在 src/main/ 各模块。
 */
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const windowState = require('./window');
// 注意：session-store 必须先于下方 app.setPath('userData', ...) 加载 ——
// 其中的 STORE_FILE 在模块加载时即按默认 userData 路径计算（历史行为，见该文件注释）。
const sessionStore = require('./session-store');
const updater = require('./updater');

// ========== 持久化会话配置 ==========

// 固定 userData 路径，确保 session 数据（cookies/localStorage 等）持久保存
const SESSION_DIR = 'cuckoo-ai-pro-session';
app.setPath('userData', path.join(app.getPath('appData'), SESSION_DIR));

console.log('[Cuckoo Code] Session 数据目录:', app.getPath('userData'));

const { registerIpcHandlers } = require('./ipc');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    title: 'Cuckoo Code Pro - DeepSeek CMD',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 需要访问 Node.js API
      partition: 'persist:cuckoo-deepseek', // 持久化 session（cookies/localStorage）
      backgroundThrottling: false, // 最小化/隐藏时不节流渲染进程，避免工具解析时序错乱
    },
  });
  windowState.setMainWindow(mainWindow);

  // 初始化自动更新（仅生产环境生效）
  updater.initAutoUpdater(mainWindow);

  // 检查 preload 文件是否存在
  const preloadPath = path.join(__dirname, '..', '..', 'preload.js');
  console.log('[Cuckoo Code Main] preload 路径:', preloadPath);
  console.log('[Cuckoo Code Main] preload 存在:', fs.existsSync(preloadPath));

  // 转发渲染进程的 console.log 到主进程
  mainWindow.webContents.on('console-message', (_event, level, message, _line, _sourceId) => {
    console.log('[Renderer Console]', message);
  });

  // 窗口最大化
  mainWindow.maximize();

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
      // 尝试恢复会话-目录映射
      sessionStore.tryRestoreSessionFromUrl();
    }
  });

  // 监听导航事件，检测URL变化（页面跳转/新会话）
  mainWindow.webContents.on('did-navigate', (_event, url) => {
    console.log('[Cuckoo Code] 页面导航:', url);
    sessionStore.handleUrlChange(url);
  });

  // 监听页面内导航（SPA路由变化）
  mainWindow.webContents.on('did-navigate-in-page', (_event, url) => {
    console.log('[Cuckoo Code] 页面内导航:', url);
    sessionStore.handleUrlChange(url);
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
    windowState.setMainWindow(null);
  });
}

// ========== 应用菜单 ==========
function setupAppMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '检查更新',
          click: () => {
            updater.checkForUpdates();
          }
        },
        { type: 'separator' },
        { role: 'about', label: '关于 Cuckoo Code' }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ========== IPC 处理器 ==========
registerIpcHandlers();

// ========== 应用生命周期 ==========

app.whenReady().then(() => {
  setupAppMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
