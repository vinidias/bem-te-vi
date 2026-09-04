/**
 * 项目初始化：目录选择、目录树、系统提示词组合与发送
 * 由原 main.js 拆分而来，逻辑保持不变。
 */
const { dialog } = require('electron');
const fs = require('fs');
const path = require('path');

const windowState = require('./window');
const { toolRegistry } = require('./tool-registry');

// 提示词模板目录
const PROMPT_DIR = path.join(__dirname, '..', 'prompt');

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
function initProject(skipPrompt = false, windowContext = null) {
  const ctx = windowContext || windowState.getMainContext();
  const mainWindow = ctx ? ctx.win : windowState.getMainWindow();
  const sessionStore = ctx ? ctx.sessionStore : null;
  // providerId 来自窗口上下文（可能为空，表示未确定平台）
  const providerId = (ctx && ctx.providerId) || '';

  // 先让用户选择目录
  const result = dialog.showOpenDialogSync(mainWindow, {
    properties: ['openDirectory'],
    buttonLabel: '选择目录',
    title: '请选择要分析的项目目录',
  });

  // 无论用户是否选择目录，对话框关闭后都恢复主窗口焦点（避免输入框失效）
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    mainWindow.webContents.focus();
  }

  if (!result || result.length === 0) {
    console.log('[Cuckoo Code] 用户取消了目录选择');
    return { success: false, message: '用户取消了目录选择' };
  }

  const selectedDir = result[0];
  console.log('[Cuckoo Code] 用户选择目录:', selectedDir);

  // 保存选中的项目目录（若该窗口有独立的 sessionStore）
  if (sessionStore) {
    sessionStore.state.selectedProjectDir = selectedDir;

    // ========== 持久化存储会话-目录映射 ==========
    // 如果当前有会话ID，保存映射
    if (sessionStore.state.currentSessionId) {
      sessionStore.saveSessionDirMapping(sessionStore.state.currentSessionId, selectedDir);
      console.log(`[Cuckoo Code] 已保存会话 ${sessionStore.state.currentSessionId} -> ${selectedDir}`);
    } else {
      // 如果未能获取会话ID，尝试从当前URL提取
      let sessionId = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        const url = mainWindow.webContents.getURL();
        sessionId = sessionStore.extractSessionIdFromUrl(url);
      }
      if (sessionId) {
        sessionStore.state.currentSessionId = sessionId;
        sessionStore.saveSessionDirMapping(sessionId, selectedDir);
        console.log(`[Cuckoo Code] 从URL提取会话ID并保存: ${sessionId} -> ${selectedDir}`);
      } else {
        // 无法获取会话ID，暂存项目目录，等待URL变化后绑定
        sessionStore.state.pendingProjectDir = selectedDir;
        console.log(`[Cuckoo Code] 暂存项目目录 ${selectedDir}，等待会话ID出现后绑定`);
      }
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

  // 初始化项目时读取对应平台模板并替换占位符
  // 选择模板文件：优先按 providerId，其次 default
  let templatePath = path.join(PROMPT_DIR, 'default.md');
  if (providerId) {
    const candidate = path.join(PROMPT_DIR, providerId + '.md');
    if (fs.existsSync(candidate)) {
      templatePath = candidate;
    } else {
      console.warn('[Cuckoo Code] 平台模板不存在，使用 default.md:', candidate);
    }
  }

  let templateContent = '';
  try {
    templateContent = fs.readFileSync(templatePath, 'utf-8');
    console.log('[Cuckoo Code] 已读取提示词模板:', templatePath);
  } catch (err) {
    console.error('[Cuckoo Code] 读取提示词模板失败:', err.message);
    return { success: false, message: '读取提示词模板失败: ' + err.message };
  }

  // 读取工具 API 类型定义（从 d.ts 文件读取，避免与模板重复维护）
  let toolApiTypes = '';
  try {
    toolApiTypes = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'cuckoo-tools.d.ts'), 'utf-8');
  } catch (err) {
    console.error('[Cuckoo Code] 读取 cuckoo-tools.d.ts 失败:', err.message);
  }

  // 获取工具库描述（JS API 格式：AI 通过生成 JS 代码调用这些函数）
  const toolsDescription = toolRegistry.getFormattedJsApiForPrompt();

  // 获取工具使用指导（section 机制，仿 dsh）
  const promptSections = toolRegistry.getFormattedPromptSections();

  // 动态生成平台信息（不硬编码，根据实际运行环境）
  const platform = process.platform;
  const arch = process.arch;
  let platformInfo = '';
  if (platform === 'win32') {
    platformInfo = '- 操作系统：Windows（' + arch + '）\n  - bash 使用 cmd.exe（Windows 命令：cd / dir / echo %cd% / type / findstr）\n  - pwsh 使用 PowerShell（Get-Location / $env:VAR / Get-ChildItem）\n  - 路径分隔符为反斜杠 \\，传给工具的相对路径统一用正斜杠 /';
  } else if (platform === 'darwin') {
    platformInfo = '- 操作系统：macOS（' + arch + '）\n  - bash 使用 zsh/bash（Unix 命令：pwd / ls / cat / grep）\n  - 路径分隔符为正斜杠 /';
  } else {
    platformInfo = '- 操作系统：Linux（' + arch + '）\n  - bash 使用 bash（Unix 命令：pwd / ls / cat / grep）\n  - 路径分隔符为正斜杠 /';
  }

  // 读取项目介绍（CUCKOO.md）
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

  // 项目介绍占位符：无内容则整体置空
  const projectIntroSection = projectIntro
    ? '---\n## 项目介绍\n' + projectIntro
    : '';

  // 统一替换模板中的双花括号占位符（全量替换，支持同一占位符多次出现）
  const placeholders = {
    '{{TOOL_API_TYPES}}': toolApiTypes,
    '{{TOOLS_LIST}}': toolsDescription,
    '{{TOOL_SECTIONS}}': promptSections,
    '{{PLATFORM_INFO}}': platformInfo,
    '{{PROJECT_DIR}}': selectedDir,
    '{{PROJECT_INTRO_SECTION}}': projectIntroSection,
  };
  let combined = templateContent;
  for (const [key, value] of Object.entries(placeholders)) {
    combined = combined.split(key).join(value);
  }

  console.log('[Cuckoo Code] 准备发送初始提示（不含目录树），长度:', combined.length);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('initial-prompt', combined);
  }

  return { success: true, message: '初始化完成，已发送系统提示词、工具规则和工具库' };
}

module.exports = { PROMPT_DIR, IGNORED_DIRS, getDirectoryTree, initProject };
