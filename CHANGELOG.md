# Changelog

## [1.0.0] - 2026-08-11

### Added
- 初始版本发布
- Electron 桌面应用，嵌入 DeepSeek 网页版
- 自动检测 AI 回复中的 `cmd`/`powershell` 代码块，弹窗确认后执行
- 工具调用系统：支持 `file_write`、`file_read`、`file_edit`、`file_glob`、`file_grep`、`bash`、`mysql`、`file_delete` 等工具
- 会话级项目目录绑定，工具操作以项目目录为基础
- 侧边覆盖层面板，显示命令预览、执行结果和历史记录
- `Ctrl+Shift+C` 快捷键切换覆盖层
- 项目初始化功能，自动生成目录树并注入系统提示词
- 支持危险命令检测与额外警告
- 会话持久化（cookies/localStorage 保存到 `%APPDATA%/cuckoo-code-session`）

### Security
- 命令执行前必须用户确认
- 危险命令（`rm -rf /`、`format`、`shutdown` 等）触发额外警告
- 30 秒命令执行超时限制
- 1MB 命令输出缓冲区限制
