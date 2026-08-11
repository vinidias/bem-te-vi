# 🧠 Cuckoo Code

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Electron](https://img.shields.io/badge/Electron-33.0.0-47848F?logo=electron&logoColor=white)](https://electronjs.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D16.0.0-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

**DeepSeek 桌面应用**——内嵌浏览器，自动识别 AI 回复中的 Shell 命令和工具调用，经用户确认后执行。

Cuckoo Code 是一个 Electron 应用，在 Chromium 窗口中嵌入 [chat.deepseek.com](https://chat.deepseek.com)，并注入一个侧边覆盖层，拦截 AI 生成的内容，提取其中的命令或工具调用，让用户安全地确认和执行。

---

## ✨ 特性

- 🖥️ **Electron 桌面应用**——跨平台支持，提供原生桌面体验
- 🛠️ **命令拦截与执行**——自动检测 `cmd`、`powershell`、`bash` 等代码块，弹窗确认后执行
- 🔧 **工具调用系统**——AI 可通过 JSON 格式调用 `file_write`、`file_read`、`file_edit`、`bash` 等 8+ 种工具
- 📂 **项目目录绑定**——每个会话可关联一个项目目录，工具操作以此为基础，实现上下文感知
- 🎨 **侧边覆盖层面板**——显示命令预览、执行结果和历史记录，支持快捷键 `Ctrl+Shift+C` 切换
- 🚨 **安全机制**——命令执行前必须用户确认；危险命令（`rm -rf /`、`format` 等）触发额外警告；30 秒超时限制
- 💾 **会话持久化**——cookies/localStorage 保存到 `%APPDATA%/cuckoo-ai-pro-session`，登录状态和设置持久保留

---

## 📦 安装与运行

### 环境要求
- Node.js >= 16.0.0
- npm 或 yarn

### 步骤

```bash
# 克隆仓库（将 your-username 替换为你的 GitHub 用户名）
git clone https://github.com/wangyongpeng90/cuckoo-code.git
cd cuckoo-code

# 安装依赖
npm install

# 启动应用
npm start
```

---

## 🚀 使用指南

1. **启动应用**——自动打开 DeepSeek 聊天页面
2. **与 AI 对话**——让 AI 生成命令或工具调用
3. **命令自动检测**——AI 回复中的 `cmd`/`powershell`/`bash` 代码块会被侧边栏捕获
4. **确认执行**——点击「确认执行」或「忽略」；危险命令会有额外警告
5. **初始化项目**——点击「初始化项目」选择项目目录，AI 将获得目录树和系统提示词，使其能感知项目结构
6. **工具调用**——AI 可通过 `jsontool` 代码块调用工具，系统执行后返回结果

### 工具调用示例

AI 回复中包含以下格式的代码块时，系统会自动解析并执行：

````markdown
```jsontool
{"toolName":"file_write","params":{"file_path":"hello.txt","content":"Hello World"},"callId":"call_123"}
```
````

执行结果会返回给 AI，AI 根据结果继续下一步操作。

---

## 🧰 工具系统

支持的工具列表（定义在 `tools/` 目录）：

| 工具名称 | 功能描述 |
|----------|----------|
| `file_write` | 写入文件（自动创建父目录） |
| `file_read` | 读取文件内容 |
| `file_edit` | 精确查找并替换文件内容 |
| `file_glob` | 按 glob 模式搜索文件 |
| `file_grep` | 按正则/文本搜索文件内容 |
| `bash` | 执行 Shell 命令 |
| `mysql` | 执行 SQL 查询（需配置） |
| `file_delete` | 删除文件（需确认） |

所有工具操作均相对于当前绑定的项目目录，确保安全性。

---

## 📁 项目结构

```
cuckoo-ai-pro/
├── main.js               # Electron 主进程
├── preload.js            # 预加载脚本（注入覆盖层 UI 和 IPC）
├── package.json
├── systemPrompt.md       # 系统提示词模板
├── tools/                # 工具实现
│   ├── ToolRegistry.js
│   ├── FileWriteTool.js
│   ├── FileReadTool.js
│   ├── ...
│   └── rules.md          # 工具调用规则说明
└── .cuckooCode/          # 项目配置目录（自动生成）
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解开发流程。

- 报告 Bug 或建议新功能 → [Issues](https://github.com/your-username/cuckoo-ai-pro/issues)
- 提交代码 → [Pull Requests](https://github.com/your-username/cuckoo-ai-pro/pulls)

---

## 📄 许可证

本项目使用 **GNU General Public License v3.0** 许可证。详见 [LICENSE](LICENSE) 文件。

---

## 🙏 致谢

- [DeepSeek](https://deepseek.com) 提供强大的 AI 能力
- [Electron](https://electronjs.org) 提供跨平台桌面框架
- 所有贡献者和用户
