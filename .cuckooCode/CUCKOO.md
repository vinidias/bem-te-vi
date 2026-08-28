# CUCKOO.md

本文件用于指导 Cuckoo AI 理解当前项目的结构、命令和约定。

## 项目简介

**Cuckoo Code** 是一个 Electron 桌面应用，将 chat.deepseek.com 嵌入浏览器窗口，并注入覆盖层面板。AI 通过系统提示词被引导生成 JavaScript 工具调用（```cuckoo 代码块），在受限沙箱中执行文件读写、命令执行、搜索、数据库查询等操作，结果回传 AI，形成 Agent 循环。

## 常用命令

```bash
# 启动 Electron 应用
npm start

# 构建发布包
npm run build:win      # Windows（nsis + portable）
npm run build:mac      # macOS（dmg + zip）

# 测试
npm test               # 运行全部单元测试
node tools/test_js_runner.js   # 测试 JsRunner 沙箱
```

## 依赖安装

```bash
npm install

# 如果 npm 提示 electron postinstall 被 allowScripts 阻止：
#   npm install-scripts approve electron
#   npm install
```

## 架构概览

- **main.js**：Electron 主进程入口（薄壳），实际实现位于 `src/main/`
- **src/main/**：主进程各模块
  - `index.js`：应用生命周期、主窗口创建
  - `ipc.js`：IPC 处理器（init-project、execute-js、execute-tool）
  - `project-context.js`：项目初始化、系统提示词组合
  - `session-store.js`：会话-目录映射持久化
  - `tool-registry.js`：工具注册表与 JsRunner 持有者
  - `window.js`：窗口状态管理
  - `dangerous-commands.js`：危险命令检测
- **src/preload/**：预加载脚本
  - `index.js`：preload 入口
  - `api.js`：contextBridge 暴露 API
  - `dom/`：AI 回复检测、工具代码块解析、会话列表
  - `overlay/`：覆盖层 UI（悬浮球模式）、事件、项目目录显示
  - `tool-names.js`：preload 可识别的工具名列表
- **tools/**：工具实现目录
  - `ToolRegistry.js`：工具注册表与 Tool 基类（支持 getPromptSection）
  - `JsRunner.js`：JS 沙箱执行器
  - 各工具实现文件
  - `rules.md`：工具调用规则（发给 AI）
  - `decodeOutput.js`：输出智能解码（UTF-8/GBK）
- **systemPrompt.md**：系统提示词模板，末尾含工具 API 的 TypeScript 声明
- **start.js**：跨平台启动脚本（Windows 设置 UTF-8，macOS/Linux 直接启动）

## 工具系统

AI 在 ```cuckoo 代码块中编写 JS，可用工具函数（13 个）：

### 文件操作
- `read(filePath, options?)` — 读取 UTF-8 文本文件，支持 offset/limit 分段
- `write(filePath, content)` — 创建或完全覆盖文件，返回 Created/Updated envelope
- `edit(filePath, oldString, newString, replaceAll?)` — 精确字符串替换
- `deleteFile(filePath)` — 删除文件

### 搜索
- `glob(pattern, searchPath?)` — 按 glob 模式查找文件，使用 ripgrep
- `grep(pattern, options?)` — 按 ripgrep 正则搜索文件内容

### 命令执行
- `bash(command, options?)` — 执行 bash 命令（Windows cmd）
- `pwsh(command, options?)` — 执行 PowerShell 命令

### 任务管理
- `todoWrite(todos)` — 全量替换任务列表

### 网络与数据库
- `webFetch(url)` — 获取 HTTP(S) URL 内容，HTML 转 Markdown
- `mysql(options)` — 执行 MySQL SQL 语句（参数：host/port/user/password/database/sql/limit）

### 调试工具
- `openBrowserWindow(url, options?)` — 打开 Electron 浏览器窗口
- `injectJS(windowId, code)` — 向指定窗口注入 JS 代码

### 辅助
- `log(...args)` — 输出中间结果（JS 层专用，shell 内不可用）

所有工具异步，需 await。相对路径基于当前项目根目录。

## 当前开发状态

- 当前分支：`fix/injectjs-iife-return`
- MySQL 工具（`mysql`）已完成实现、测试并提交
- 交接文档：`HANDOFF_MYSQL.md`
- 未跟踪文件：`HANDOFF_MYSQL.md`、`doc/`、`src/greeting.txt`、`tools/test_mysql_full.js`

## 关键约定

- 修改 preload 后需重启应用生效
- 新增工具同步步骤：
  1. `tools/` 下实现 Tool 类
  2. `tools/index.js` 注册
  3. `JsRunner.js` BOOTSTRAP 加 JS 函数
  4. `src/preload/tool-names.js` 登记工具名
  5. `systemPrompt.md` 与 `tools/cuckoo-tools.d.ts` 更新 TypeScript 声明
  6. 工具类实现 `getPromptSection()`（section 机制）
- 危险命令黑名单在 `tools/BashTool.js` 和 `src/main/dangerous-commands.js`
- 用户数据目录固定为 %APPDATA%/cuckoo-ai-pro-session
- Git 远程：github（SSH）+ origin/codeup（SSH）
- 版本发布：npm version patch/minor/major 自动同步并打 tag
- 自动更新与发布方案：见 `.cuckooCode/AUTO_UPDATE_RELEASE.md`（含每步原因、故障排查）

## 注意事项

- 不要删除 preload_restored.js（历史备份，勿动）
- tools/ 下多个 test*.js 是开发期测试脚本，不要删除
- 构建产物输出到 dist/，不要手动提交
- 旧工具（File*、GlobTool、GrepTool）运行时保留但提示词中不展示
- d.ts 文件是 CRLF 换行，editFile 时注意换行符问题
- MySQLTool 只有 SELECT 才自动加 LIMIT；SHOW/DESCRIBE/EXPLAIN 不支持 LIMIT
- alert() 已全部替换为 showToast/showConfirmDialog，避免同步阻塞导致输入框失效
