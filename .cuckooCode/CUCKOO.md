# CUCKOO.md

本文件用于指导 Cuckoo AI 理解当前项目的结构、命令和约定。

## 项目简介

**Cuckoo Code** 是一个 Electron 桌面应用，将 chat.deepseek.com 嵌入浏览器窗口，并注入一个侧边覆盖层面板。AI 通过系统提示词被引导生成 JavaScript 工具调用（```cuckoo 代码块），在受限沙箱中执行文件读写、命令执行、搜索、数据库查询等操作，结果回传 AI，形成 Agent 循环。

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

- **main.js**：Electron 主进程。创建 BrowserWindow、加载 DeepSeek、处理 IPC、管理目录选择、持有 ToolRegistry 和 JsRunner。
- **preload.js**：预加载脚本。注入覆盖层 UI，用 MutationObserver 检测 AI 回复中的命令和工具代码块，通过 IPC 交给主进程执行。
- **tools/**：工具实现目录。
  - ToolRegistry.js：工具注册表
  - JsRunner.js：JS 沙箱执行器
  - 各具体工具：FileRead/Write/Edit/Glob/Grep/Bash/MySQL/WebFetch/Delete
  - rules.md：工具调用规则（发给 AI）
- **systemPrompt.md**：系统提示词模板，末尾含工具 API 的 TypeScript 声明。
- **.cuckooCode/CUCKOO.md**：本文件，项目说明。

## 工具系统

AI 在 ```cuckoo 代码块中编写 JS，可用工具函数：

- readFile / writeFile / editFile / glob / grep
- bash（执行 shell 命令）
- mysql（SQL 查询）
- webFetch（访问网页/API）
- deleteFile（删除文件）
- log（输出中间结果）

所有工具异步，需 await。相对路径基于当前项目根目录。

## 关键约定

- 修改 preload.js 后需重启应用生效
- 工具注册在主进程和 preload 需保持同步：
  - 新增工具：tools/ 下实现 → main.js 注册 → JsRunner.js BOOTSTRAP 加 JS 函数 → preload 的 JS_TOOL_CALL_RE 登记 → 更新 cuckoo-tools.d.ts 与 systemPrompt.md
- 危险命令黑名单防止误执行
- 用户数据目录固定为 %APPDATA%/cuckoo-ai-pro-session
- 版本发布：npm version patch/minor/major 自动同步并打 tag，推送后 GitHub Actions 自动构建发布

## 注意事项

- 不要删除 preload_restored.js（历史备份，勿动）
- tools/ 下多个 test*.js 是开发期测试脚本，不要删除
- 构建产物输出到 dist/，不要手动提交
