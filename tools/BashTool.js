const { Tool, ToolResult } = require('./ToolRegistry');
const { exec } = require('child_process');
const path = require('path');

// 危险命令列表（与 main.js 的 execute-command 一致），匹配的命令会被拒绝
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

/**
 * Bash 执行工具 - 仿照 Claude Code 的 Bash 工具
 * 执行 shell 命令并返回输出（Windows 使用 cmd.exe，Linux/Mac 使用 sh，跨平台）
 */
class BashTool extends Tool {
  constructor() {
    super(
      'bash',
      `
      你是一个可以使用 "bash" 工具来执行 shell 命令的助手。

工具说明：
- 名称：bash
- 用途：执行 shell 命令（Windows 下使用 cmd.exe，Linux/Mac 下使用 sh），返回 stdout/stderr 输出。
- 参数：
  - command（字符串，必填）：要执行的命令
  - cwd（字符串，选填）：命令的工作目录（相对路径），默认项目根目录
  - timeout（数字，选填）：超时时间（毫秒），默认 30000

可用于：查看目录、运行构建、安装依赖（npm install）、运行测试、git 操作等。
危险命令（如格式化磁盘、删除系统文件、关机等）会被安全策略拒绝。
命令输出上限 1MB，执行超时上限 30 秒。

使用工具时的回复格式：
- 不要添加任何解释、前缀或后缀。
- 将 JSON 输出在标准的 Markdown 代码块中（\`\`\`json），并确保内容正确转义：

\`\`\`json
{"toolName":"bash","params":{"command":"dir /b"},"callId":"唯一调用ID"}
\`\`\`

如果用户没有要求执行命令，请像普通助手一样正常回复，不要输出任何 JSON。
      `,
      {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '要执行的 shell 命令'
          },
          cwd: {
            type: 'string',
            description: '命令的工作目录（相对路径），默认项目根目录'
          },
          timeout: {
            type: 'number',
            description: '超时时间（毫秒），默认 30000',
            default: 30000
          }
        },
        required: ['command'],
        additionalProperties: false
      }
    );
  }

  /**
   * 执行 shell 命令
   * @param {Object} params - { command, cwd?, timeout?, projectDir? }
   * @returns {Promise<ToolResult>}
   */
  async execute(params) {
    const { command, cwd, timeout = 30000, projectDir } = params;

    try {
      if (!command || typeof command !== 'string') {
        return ToolResult.error('command 不能为空');
      }

      const trimmed = command.trim();
      if (!trimmed) {
        return ToolResult.error('command 不能为空');
      }

      // 危险命令检查
      if (DANGEROUS_CMDS.some((p) => p.test(trimmed))) {
        console.log('[BashTool] ⚠️ 拒绝危险命令:', trimmed);
        return ToolResult.error('命令被安全策略拒绝（匹配危险命令列表）: ' + trimmed);
      }

      // 确定工作目录
      let workDir;
      if (cwd) {
        const normalized = cwd.replace(/\//g, path.sep);
        workDir = path.isAbsolute(normalized)
          ? normalized
          : (projectDir ? path.join(projectDir, normalized) : path.resolve(normalized));
      } else if (projectDir) {
        workDir = projectDir;
      } else {
        workDir = process.env.USERPROFILE || process.env.HOME || 'C:\\';
      }

      console.log(`[BashTool] 执行命令: ${trimmed}, cwd=${workDir}`);

      return await new Promise((resolve) => {
        exec(
          trimmed,
          {
            cwd: workDir,
            timeout: timeout,
            maxBuffer: 1024 * 1024, // 1MB
            windowsHide: true,
          },
          (error, stdout, stderr) => {
            if (error) {
              resolve(ToolResult.error(
                `命令执行失败: ${error.message}\nstdout: ${stdout || '(空)'}\nstderr: ${stderr || '(空)'}`
              ));
            } else {
              resolve(ToolResult.success({
                message: '命令执行成功',
                command: trimmed,
                cwd: workDir,
                stdout: stdout || '',
                stderr: stderr || '',
                exitCode: 0,
              }));
            }
          }
        );
      });
    } catch (err) {
      return ToolResult.error(`命令执行异常: ${err.message}`);
    }
  }
}

module.exports = { BashTool };
