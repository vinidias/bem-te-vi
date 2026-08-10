# cuckoo-code

DeepSeek 桌面应用——内嵌浏览器，识别 AI 回答中的 shell 命令和工具调用并执行。

## 环境要求

- Node.js >= 16.0.0
- npm 或 yarn

## 特性

- 🖥️ 基于 Electron 的桌面应用，嵌入 DeepSeek 网页版
- 🛠️ 自动检测 AI 回复中的 `cmd`/`powershell` 代码块，弹窗确认后执行
- 🔧 工具调用系统：AI 可通过 JSON 格式调用 `file_write`、`file_read`、`file_edit`、`bash` 等工具
- 📂 会话级项目目录绑定：每个聊天会话可关联一个项目目录，工具操作以此为基础
- 🎨 侧边覆盖层面板，显示命令预览、执行结果和历史记录

## 安装与运行

```bash
# 克隆项目（请将 your-username 替换为你的 GitHub 用户名）
git clone https://github.com/your-username/cuckoo-ai-pro.git
cd cuckoo-ai-pro

# 安装依赖
npm install

# 启动应用
npm start
```

## 依赖

- Electron ^33.0.0
- mysql2 ^3.23.2（可选，MySQL 工具支持）

## 使用说明

1. 启动应用后，自动打开 DeepSeek 聊天页面
2. AI 回复中包含 `cmd`/`powershell` 代码块时，侧边栏会自动弹出并显示命令
3. 点击「确认执行」或「忽略」处理命令
4. 点击「初始化项目」选择项目目录，AI 将获得当前项目目录树和系统提示词
5. AI 可通过 `jsontool` 代码块调用工具（如 `file_write`、`bash` 等）

### 工具调用示例

AI 回复中包含如下代码块时，系统会自动解析并执行：

````markdown
@@@jsontool-start
{"toolName":"file_write","params":{"file_path":"hello.txt","content":"Hello World"},"callId":"call_123"}
@@@jsontool-end
````

系统执行后会返回结果，AI 会根据结果继续下一步操作。

## 工具系统

支持的工具列表（定义在 `tools/` 目录）：

- `file_write` - 写入文件
- `file_read` - 读取文件
- `file_edit` - 编辑文件（查找替换）
- `file_glob` - 按模式搜索文件
- `file_grep` - 搜索文件内容
- `bash` - 执行 shell 命令
- `mysql` - 执行 SQL 查询
- `file_delete` - 删除文件

## 开源协议

GNU General Public License v3.0

## 贡献

欢迎提交 Issue 和 Pull Request。
