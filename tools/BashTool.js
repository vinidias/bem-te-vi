const { Tool, ToolResult } = require('./ToolRegistry');
const { exec } = require('child_process');
const path = require('path');
const { decodeOutput, normalizeCommand } = require('./decodeOutput');

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
      'bash', '执行 shell 命令（Windows 使用 cmd.exe），返回 stdout/stderr/exitCode。危险命令会被安全策略拒绝。',
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
      },
      'bash(command, options?)'
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

      const trimmed = normalizeCommand(command.trim());
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
            encoding: 'buffer',
          },
          (error, stdout, stderr) => {
            const out = decodeOutput(stdout);
            const err = decodeOutput(stderr);
            if (error) {
              resolve(ToolResult.error(
                '命令执行失败: ' + error.message + String.fromCharCode(10) +
                'stdout: ' + (out || '(空)') + String.fromCharCode(10) +
                'stderr: ' + (err || '(空)')
              ));
            } else {
              resolve(ToolResult.success({
                message: '命令执行成功',
                command: trimmed,
                cwd: workDir,
                stdout: out,
                stderr: err,
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

module.exports = { BashTool, DANGEROUS_CMDS };