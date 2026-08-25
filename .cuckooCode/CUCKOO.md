# CUCKOO.md

本文件用于指导 Cuckoo AI 理解当前项目的结构、命令和约定。

## 项目简介

**Cuckoo Code** 是一个 Electron 桌面应用，将 chat.deepseek.com 嵌入浏览器窗口，并注入覆盖层面板。AI 通过系统提示词被引导生成 JavaScript 工具调用（```cuckoo 代码块），在受限沙箱中执行文件读写、命令执行、搜索、任务管理等操作，结果回传 AI，形成 Agent 循环。

## 常用命令

```bash
# 启动 Electron 应用（使用 UTF-8 控制台编码）
npm start

# 构建发布包
npm run build:win      # Windows（nsis + portable）
npm run build:mac      # macOS（dmg + zip）

# 测试 JsRunner 沙箱与工具桥接
node tools/test_js_runner.js
```

## 架构概览

- **main.js**：Electron 主进程入口（薄壳），实际实现位于 `src/main/`。
- **src/main/**：主进程各模块。
  - `index.js`：应用生命周期、主窗口创建
  - `ipc.js`：IPC 处理器（init-project、execute-js 等）
  - `project-context.js`：项目初始化、系统提示词组合
  - `session-store.js`：会话-目录映射持久化
  - `tool-registry.js`：工具注册表与 JsRunner 持有者
  - `window.js`：窗口状态管理
  - `dangerous-commands.js`：危险命令检测
- **src/preload/**：预加载脚本。
  - `index.js`：preload 入口
  - `api.js`：暴露给渲染进程的 API
  - `dom/`：AI 回复检测、工具代码块解析、会话列表等
  - `overlay/`：覆盖层 UI、事件、项目目录显示
  - `tool-names.js`：preload 可识别的工具名列表
- **tools/**：工具实现目录。
  - `ToolRegistry.js`：工具注册表与 Tool 基类
  - `JsRunner.js`：JS 沙箱执行器（AI 生成的工具代码在此运行）
  - 新工具（提示词中展示）：`ReadTool`、`WriteTool`、`EditTool`、`GlobToolNew`、`GrepToolNew`、`TodoWriteTool`、`BashTool`、`FileDeleteTool`、`WebFetchTool`
  - 旧工具（运行时保留但提示词中隐藏）：`FileReadTool`、`FileWriteTool`、`FileEditTool`、`GlobTool`、`GrepTool`
  - `rules.md`：工具调用规则（发给 AI）
  - `decodeOutput.js`：输出智能解码（UTF-8/GBK）
- **systemPrompt.md**：系统提示词模板，末尾含工具 API 的 TypeScript 声明。
- **.cuckooCode/CUCKOO.md**：本文件，项目说明。

## 工具系统

AI 在 ```cuckoo 代码块中编写 JS，可用工具函数：

- `read(filePath, options?)` — 读取 UTF-8 文本文件，支持 offset/limit 分段（仿 dsh read）
- `write(filePath, content)` — 创建或完全覆盖文件，返回 Created/Updated envelope（仿 dsh write）
- `edit(filePath, oldString, newString, replaceAll?)` — 精确字符串替换（仿 dsh edit）
- `glob(pattern, searchPath?)` — 按 glob 模式查找文件，使用 ripgrep（仿 dsh glob）
- `grep(pattern, options?)` — 按 ripgrep 正则搜索文件内容（仿 dsh grep）
- `todoWrite(todos)` — 全量替换任务列表（仿 dsh todo_write）
- `bash(command, options?)` — 执行 shell 命令，非零退出以 [exit code] 标记返回
- `deleteFile(filePath)` — 删除文件
- `webFetch(url, options?)` — 访问网页/API
- `log(...args)` — 输出中间结果

所有工具异步，需 await。相对路径基于当前项目根目录。

工具注册在主进程（`tools/index.js`）和 preload（`src/preload/tool-names.js`）需保持同步。

## 关键约定

- 修改 preload.js 后需重启应用生效
- 新增工具同步步骤：
  1. `tools/` 下实现 Tool 类
  2. `tools/index.js` 注册
  3. `JsRunner.js` BOOTSTRAP 加 JS 函数
  4. `src/preload/tool-names.js` 登记工具名
  5. `systemPrompt.md` 与 `tools/cuckoo-tools.d.ts` 更新 TypeScript 声明
- 危险命令黑名单在 `tools/BashTool.js` 和 `src/main/dangerous-commands.js` 维护
- 用户数据目录固定为 %APPDATA%/cuckoo-ai-pro-session
- 依赖 `@vscode/ripgrep` 提供 ripgrep 二进制，供 glob/grep 使用
- 版本发布：npm version patch/minor/major 自动同步并打 tag，推送后 GitHub Actions 自动构建发布

## 注意事项

- 不要删除 preload_restored.js（历史备份，勿动）
- tools/ 下多个 test*.js 是开发期测试脚本，不要删除
- 构建产物输出到 dist/，不要手动提交
- 旧工具（File*、GlobTool、GrepTool）运行时保留以兼容旧代码，但提示词中不再展示
