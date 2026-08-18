const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// ========== 工具库集成 ==========
const { ToolRegistry, Tool, ToolResult } = require('./tools/ToolRegistry');
const { FileWriteTool } = require('./tools/FileWriteTool');
const { FileReadTool } = require('./tools/FileReadTool');
const { FileEditTool } = require('./tools/FileEditTool');
const { GlobTool } = require('./tools/GlobTool');
const { GrepTool } = require('./tools/GrepTool');
const { BashTool } = require('./tools/BashTool');
const { MySQLTool } = require('./tools/MySQLTool');
const { FileDeleteTool } = require('./tools/FileDeleteTool');
const { WebFetchTool } = require('./tools/WebFetchTool');
const { JsRunner } = require('./tools/JsRunner');
const { decodeOutput, normalizeCommand } = require('./tools/decodeOutput');

// 创建工具注册表并注册工具
const toolRegistry = new ToolRegistry();
toolRegistry.register(new FileWriteTool());
toolRegistry.register(new FileReadTool());
toolRegistry.register(new FileEditTool());
toolRegistry.register(new GlobTool());
toolRegistry.register(new GrepTool());
toolRegistry.register(new BashTool());
toolRegistry.register(new MySQLTool());
toolRegistry.register(new FileDeleteTool());
toolRegistry.register(new WebFetchTool());
// 后续可在此注册更多工具

// JS 工具脚本执行器（AI 生成 JS 代码调用工具函数）
const jsRunner = new JsRunner(toolRegistry);

let mainWindow = null;
let sidebarWindow = null;

// systemPrompt.md 路径
const SYSTEM_PROMPT_PATH = path.join(__dirname, 'systemPrompt.md');

// ========== 会话-目录映射持久化存储 ==========
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

// 当前会话ID（从页面URL中提取）
let currentSessionId = null;
// 当前选中的项目目录（内存缓存）
let selectedProjectDir = null;
// 待绑定的项目目录（当初始化时还未获取到sessionId时暂存）
let pendingProjectDir = null;

/**
 * 处理URL变化：提取会话ID，并尝试恢复项目目录
 */
function handleUrlChange(url) {
  const sessionId = extractSessionIdFromUrl(url);
  if (sessionId) {
    currentSessionId = sessionId;
    console.log(`[Cuckoo Code] 当前会话ID: ${sessionId}`);

    // 检查是否有暂存的项目目录需要绑定到当前会话
    if (pendingProjectDir) {
      console.log(`[Cuckoo Code] 发现暂存项目目录 ${pendingProjectDir}，立即绑定到会话 ${sessionId}`);
      saveSessionDirMapping(sessionId, pendingProjectDir);
      selectedProjectDir = pendingProjectDir;
      pendingProjectDir = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('project-dir-updated', selectedProjectDir);
        mainWindow.webContents.send('session-restored', { sessionId, projectDir: selectedProjectDir });
      }
      console.log(`[Cuckoo Code] 暂存目录已绑定到会话 ${sessionId}`);
      return;
    }

    // 尝试从存储中恢复项目目录
    const restoredDir = getProjectDirBySessionId(sessionId);
    if (restoredDir) {
      selectedProjectDir = restoredDir;
      console.log(`[Cuckoo Code] 已恢复项目目录: ${restoredDir}`);
      // 通知渲染进程恢复成功
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('session-restored', { sessionId, projectDir: restoredDir });
        // 发送目录更新事件，更新UI显示
        mainWindow.webContents.send('project-dir-updated', restoredDir);
      }
    } else {
      console.log(`[Cuckoo Code] 会话 ${sessionId} 未找到关联的项目目录`);
      // 清空当前目录
      selectedProjectDir = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        // 发送空目录事件，更新UI显示为“未选择”
        mainWindow.webContents.send('project-dir-updated', null);
      }
    }
  } else {
    // 非会话页面（如首页），清空状态
    currentSessionId = null;
    selectedProjectDir = null;
    console.log('[Cuckoo Code] 未检测到会话ID，已清空项目目录');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project-dir-updated', null);
    }
  }
}

/**
 * 尝试从当前URL恢复会话和项目目录（在页面加载完成后调用）
 */
function tryRestoreSessionFromUrl() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const url = mainWindow.webContents.getURL();
  console.log('[Cuckoo Code] 尝试恢复会话，当前URL:', url);
  handleUrlChange(url);
}


// ========== 持久化会话配置 ==========

// 固定 userData 路径，确保 session 数据（cookies/localStorage 等）持久保存
const SESSION_DIR = 'cuckoo-ai-pro-session';
app.setPath('userData', path.join(app.getPath('appData'), SESSION_DIR));

console.log('[Cuckoo Code] Session 数据目录:', app.getPath('userData'));

/**
 * 递归获取目录树结构字符串
 * @param {string} dir 目录路径
 * @param {number} depth 当前深度
 * @returns {string} 目录树字符串
 */
// 需要忽略的目录（依赖、构建产物、版本控制等）
const IGNORED_DIRS = new Set([
  'node_modules', 'target', 'build', 'dist', 'out',
  '.git', '.svn', '.hg',
  '__pycache__', '.pytest_cache', '.coverage',
  'vendor', 'bower_components', 'jspm_packages',
  '.idea', '.vscode', '.vs',
  'logs', 'tmp', 'temp',
  'bin', 'obj',
]);

/**
 * 递归获取目录树结构字符串（类似 Windows tree 命令风格）
 * @param {string} dir 目录路径
 * @param {string} prefix 当前行前缀（用于绘制树形结构）
 * @returns {string} 目录树字符串
 */
function getDirectoryTree(dir, prefix = '') {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // 过滤：跳过隐藏文件和忽略的目录
    const visibleEntries = entries
      .filter(e => !e.name.startsWith('.'))
      .filter(e => !e.isDirectory() || !IGNORED_DIRS.has(e.name))
      .sort((a, b) => {
        // 目录优先，然后按名称排序
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    let tree = '';

    visibleEntries.forEach((entry, index) => {
      const isLast = index === visibleEntries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = prefix + (isLast ? '    ' : '│   ');

      tree += `${prefix}${connector}${entry.name}${entry.isDirectory() ? '/' : ''}\n`;

      if (entry.isDirectory()) {
        tree += getDirectoryTree(path.join(dir, entry.name), childPrefix);
      }
    });

    return tree;
  } catch (err) {
    console.error('[Cuckoo Code] 读取目录失败:', err.message);
    return `${prefix}└── [无法读取目录: ${dir}]\n`;
  }
}

/**
 * 初始化项目：选择目录并发送目录树 + systemPrompt
 * 供 IPC 调用（用户点击初始化按钮时触发）
 * @param {boolean} skipPrompt - 如果为true，只更新目录映射，不发送初始提示（用于修改目录）
 */
function initProject(skipPrompt = false) {
  // 先让用户选择目录
  const result = dialog.showOpenDialogSync(mainWindow, {
    properties: ['openDirectory'],
    buttonLabel: '选择目录',
    title: '请选择要分析的项目目录',
  });

  if (!result || result.length === 0) {
    console.log('[Cuckoo Code] 用户取消了目录选择');
    return { success: false, message: '用户取消了目录选择' };
  }

  const selectedDir = result[0];
  console.log('[Cuckoo Code] 用户选择目录:', selectedDir);

  // 保存选中的项目目录
  selectedProjectDir = selectedDir;

  // ========== 持久化存储会话-目录映射 ==========
  // 如果当前有会话ID，保存映射
  if (currentSessionId) {
    saveSessionDirMapping(currentSessionId, selectedDir);
    console.log(`[Cuckoo Code] 已保存会话 ${currentSessionId} -> ${selectedDir}`);
  } else {
    // 如果未能获取会话ID，尝试从当前URL提取
    let sessionId = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      const url = mainWindow.webContents.getURL();
      sessionId = extractSessionIdFromUrl(url);
    }
    if (sessionId) {
      currentSessionId = sessionId;
      saveSessionDirMapping(sessionId, selectedDir);
      console.log(`[Cuckoo Code] 从URL提取会话ID并保存: ${sessionId} -> ${selectedDir}`);
    } else {
      // 无法获取会话ID，暂存项目目录，等待URL变化后绑定
      pendingProjectDir = selectedDir;
      console.log(`[Cuckoo Code] 暂存项目目录 ${selectedDir}，等待会话ID出现后绑定`);
    }
  }

  // 发送目录更新事件到渲染进程
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('project-dir-updated', selectedDir);
  }

  // 如果只是修改目录，跳过发送初始提示
  if (skipPrompt) {
    return { success: true, message: '项目目录已更新' };
  }

  // 初始化项目时发送系统提示词和工具规则（不含目录树）
  // 读取系统提示词
  let promptContent = '';
  try {
    if (fs.existsSync(SYSTEM_PROMPT_PATH)) {
      promptContent = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
    } else {
      console.warn('[Cuckoo Code] systemPrompt.md 不存在');
    }
  } catch (err) {
    console.error('[Cuckoo Code] 读取 systemPrompt.md 失败:', err.message);
  }

  // 读取工具使用规则
  let rulesContent = '';
  const RULES_PATH = path.join(__dirname, 'tools', 'rules.md');
  try {
    if (fs.existsSync(RULES_PATH)) {
      rulesContent = fs.readFileSync(RULES_PATH, 'utf-8');
    }
  } catch (err) {
    console.error('[Cuckoo Code] 读取 rules.md 失败:', err.message);
  }

  // 获取工具库描述（JS API 格式：AI 通过生成 JS 代码调用这些函数）
  const toolsDescription = toolRegistry.getFormattedJsApiForPrompt();

  // 将 {TOOLS_LIST} 占位符替换为实际工具列表
  const finalRules = rulesContent.replace('{TOOLS_LIST}', toolsDescription);
  const finalPrompt = promptContent.replace('{TOOLS_LIST}', toolsDescription);

  // 组合内容（包含目录树）
  let projectIntro = '';
  const cuckooMdPath = path.join(selectedDir, '.cuckooCode', 'CUCKOO.md');
  if (fs.existsSync(cuckooMdPath)) {
    try {
      projectIntro = fs.readFileSync(cuckooMdPath, 'utf-8');
      console.log('[Cuckoo Code] 已读取 CUCKOO.md 内容');
    } catch (err) {
      console.error('[Cuckoo Code] 读取 CUCKOO.md 失败:', err.message);
    }
  }

  // 获取目录树
  // let directoryTree = '';
  // try {
  //   if (fs.existsSync(selectedDir)) {
  //     directoryTree = getDirectoryTree(selectedDir);
  //     console.log('[Cuckoo Code] 已获取目录树');
  //   }
  // } catch (err) {
  //   console.error('[Cuckoo Code] 获取目录树失败:', err.message);
  // }

  const combined = `
系统提示词：
${finalPrompt}
---
工具使用规则：
${finalRules}
${projectIntro ? `---
## 项目介绍
${projectIntro}` : ''}
---
## 当前项目目录
当前项目路径: ${selectedDir}
---
如果你觉得需要使用工具，请直接回答工具指令及入参，其他内容不需要回复`;

  console.log('[Cuckoo Code] 准备发送初始提示（不含目录树），长度:', combined.length);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('initial-prompt', combined);
  }

  return { success: true, message: '初始化完成，已发送系统提示词、工具规则和工具库' };
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
      console.log('[Cuckoo Code] systemPrompt.md 已读取，长度:', content.length, '字节');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-prompt', content);
      }
    } else {
      console.log('[Cuckoo Code] systemPrompt.md 不存在，跳过');
    }
  } catch (err) {
    console.error('[Cuckoo Code] 读取 systemPrompt.md 失败:', err.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    title: 'Cuckoo Code Pro - DeepSeek CMD',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 需要访问 Node.js API
      partition: 'persist:cuckoo-deepseek', // 持久化 session（cookies/localStorage）
    },
  });

  // 检查 preload 文件是否存在
  const preloadPath = path.join(__dirname, 'preload.js');
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
      tryRestoreSessionFromUrl();
    }
  });

  // 监听导航事件，检测URL变化（页面跳转/新会话）
  mainWindow.webContents.on('did-navigate', (_event, url) => {
    console.log('[Cuckoo Code] 页面导航:', url);
    handleUrlChange(url);
  });

  // 监听页面内导航（SPA路由变化）
  mainWindow.webContents.on('did-navigate-in-page', (_event, url) => {
    console.log('[Cuckoo Code] 页面内导航:', url);
    handleUrlChange(url);
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

// 初始化项目：选择目录并发送目录树 + systemPrompt
ipcMain.handle('init-project', async (_event, { skipPrompt = false } = {}) => {
  return initProject(skipPrompt);
});

// 列出当前项目目录关联的所有会话ID
ipcMain.handle('list-sessions', async () => {
  if (!selectedProjectDir) {
    return { success: true, sessions: [] };
  }
  const store = readSessionStore();
  const sessions = Object.keys(store).filter(sessionId => store[sessionId] === selectedProjectDir);
  console.log(`[Cuckoo Code] 列出会话，项目目录 ${selectedProjectDir} 关联 ${sessions.length} 个会话`);
  return { success: true, sessions };
});

// 导航到指定会话
ipcMain.handle('navigate-session', async (_event, { sessionId }) => {
  if (!sessionId) {
    return { success: false, error: '缺少会话ID' };
  }
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

  // 步骤 2: 执行命令（encoding: 'buffer' + 智能解码，避免中文 GBK 乱码）
  return new Promise((resolve) => {
    const child = exec(
      trimmed,
      {
        cwd: selectedProjectDir || process.env.USERPROFILE || app.getPath('home'),
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
  console.log(`[Cuckoo Code] 执行工具: ${toolName}, projectDir=${selectedProjectDir || '(未初始化,相对路径将解析到系统目录)'}`, JSON.stringify(params));
  try {
    // 如果有选中的项目目录，将其作为工作目录传递给工具
    const paramsWithContext = {
      ...params,
      projectDir: selectedProjectDir
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
    const result = await jsRunner.run(code, selectedProjectDir);
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
