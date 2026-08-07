# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 命令

```bash
# 启动 Electron 应用（使用 UTF-8 控制台编码）
npm start
```

暂无测试、代码检查或构建脚本。

## 架构

**Cuckoo AI Pro** 是一个 Electron 桌面应用，通过 `BrowserWindow.loadURL` 将 chat.deepseek.com 嵌入到 Chromium 窗口中。它注入一个侧边覆盖层面板，用于拦截、确认并执行 AI 回复中检测到的 shell 命令和工具调用。AI 通过系统提示词被引导使用特定的 JSON 工具调用格式。

### 进程模型

- **主进程** (`main.js`)：创建 `BrowserWindow`，加载 DeepSeek，处理命令执行和工具调用的 IPC 通信，管理目录选择，持有 `ToolRegistry` 实例。
- **预加载脚本** (`preload.js`)：在 `contextIsolation: true` 模式下运行。注入覆盖层 UI（HTML/CSS），通过 `MutationObserver` 监控 DOM 中的 `cmd` 代码块和工具调用 JSON，通过 `contextBridge` 暴露 `window.electronAPI`，并包含一个内联的 `UnifiedToolManager`（用于渲染侧的工具描述和参数验证；实际执行通过 IPC 回到主进程）。

### 核心 IPC 通道

| 通道 | 方向 | 用途 |
|---|---|---|
| `execute-command` | 渲染进程 → 主进程 | 执行 shell 命令，弹确认框后返回 stdout/stderr |
| `init-project` | 渲染进程 → 主进程 | 打开目录选择器，生成目录树，与 `systemPrompt.md` + `tools/rules.md` 组合，通过 `initial-prompt` 发送结果 |
| `execute-tool` | 渲染进程 → 主进程 | 将工具调用（名称 + 参数）路由到 `ToolRegistry.execute()` |
| `system-prompt` | 主进程 → 渲染进程 | 将 `systemPrompt.md` 内容推送到 preload，用于自动填入聊天输入框 |
| `initial-prompt` | 主进程 → 渲染进程 | 项目初始化后推送组合后的目录树 + 提示词块 |

### 工具系统

定义在 `tools/` 目录下：
- `ToolRegistry.js` — `Tool` 基类和 `ToolRegistry`（基于 Map 的注册表，提供 `register`、`execute`、`getFormattedToolsForPrompt` 等方法）
- `FileWriteTool.js` — 目前唯一实现的工具；相对于 `selectedProjectDir` 写入文件，自动创建父目录
- `index.js` — 便捷导出

**主进程**持有权威的 `ToolRegistry` 实例。**preload** 中有一个独立的内联 `UnifiedToolManager` 类，用于渲染侧的工具解析/验证，但实际执行通过 `execute-tool` IPC 委托给主进程。

### 覆盖层 UI（由 preload 注入）

一个固定在右侧的面板（`#cuckoo-overlay`，宽 380px），功能包括：
- 显示检测到的命令和工具调用
- 提供"确认执行"/"忽略"按钮处理 shell 命令
- 提供"初始化项目"按钮（触发 `init-project` IPC）和"发送系统提示词"按钮
- 提供"手动解析"按钮，扫描当前页面中的工具调用 JSON
- 显示执行结果和可滚动的命令历史记录
- 通过 `Ctrl+Shift+C` 或 Esc 切换显示；检测到命令时自动弹出

### DOM 监控流程

1. `MutationObserver` 监听 `document.body` 中新增的 `pre`/`code` 元素
2. 检测标记为 `cmd`、`powershell`、`batch`、`bat`、`dos` 语言的代码块（通过 `data-language` 属性、CSS 类名 `language-*` 或首行标记识别）
3. 提取命令文本并在覆盖层中显示，等待用户确认
4. 处理前先通过 `isAIResponseComplete()` 检查 AI 是否已完成回复，避免处理部分流式输出（检查生成中指示器、流式光标、停止按钮等）
5. 独立扫描代码块和页面文本中的工具调用 JSON（`{"toolName": "...", "params": {...}}`）

### 项目初始化流程

1. 用户点击覆盖层中的"初始化项目"按钮
2. 主进程弹出原生目录选择对话框
3. `getDirectoryTree()` 递归生成 `tree` 风格的目录树字符串（跳过 `node_modules`、`.git`、`dist`、`build`、`__pycache__`、IDE 目录等）
4. 读取 `systemPrompt.md` 和 `tools/rules.md` 内容，将 `{TOOLS_LIST}` 占位符替换为已注册的工具描述
5. 组合后的提示词（目录树 + 系统提示词 + 工具规则）通过 `initial-prompt` IPC 发送到渲染进程
6. Preload 将其填入 DeepSeek 聊天输入框并自动发送

### 命令执行安全

- 所有命令在执行前都会弹出确认对话框（含取消/确认按钮）
- 危险命令匹配列表（`rm -rf /`、`format`、`shutdown`、`taskkill`、`diskpart`、`reg delete`、`cipher /w` 等）会触发额外的 ⚠️ 警告
- 命令执行有 30 秒超时限制和 1MB 输出缓冲区，工作目录设为 `USERPROFILE`

### 会话持久化

- `userData` 路径固定为 `%APPDATA%/cuckoo-ai-pro-session`，确保 cookies/localStorage 持久保存
- 浏览器分区为 `persist:cuckoo-deepseek`

### 配置

`.claude/settings.json` 配置为使用 DeepSeek 的 Anthropic 兼容 API（`https://api.deepseek.com/anthropic`），模型为 `deepseek-v4-pro[1m]`，小模型为 `deepseek-v4-flash`。
