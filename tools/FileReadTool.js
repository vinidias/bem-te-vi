

const { Tool, ToolResult } = require('./ToolRegistry');
const fs = require('fs');
const path = require('path');

/**
 * 文件读取工具
 * 用于读取项目中的文件内容
 */
class FileReadTool extends Tool {
  constructor() {
    super(
      'file_read',
      `
      你是一个可以使用 "file_read" 工具来读取文件的助手。

工具说明：
- 名称：file_read
- 用途：读取指定文件的内容。如果文件不存在或读取失败，会返回错误信息。
- 参数：
  - file_path（字符串，必填）：文件的相对路径或绝对路径。 不要用 / , 而是用\ 作为目录分隔符
  - encoding（字符串，选填）：文件编码，默认为 "utf-8"。仅在需要非默认编码时才包含此参数。
- 限制：超过 1MB 的文件只会返回前 1MB 内容。

使用工具时的回复格式：
- 不要添加任何解释、前缀或后缀。
- 将 JSON 输出在标准的 Markdown 代码块中（\`\`\`json）：

\`\`\`json
{"toolName":"file_read","params":{"file_path":"<路径>"},"callId":"唯一调用ID"}
\`\`\`

示例：
\`\`\`json
{"toolName":"file_read","params":{"file_path":"src/utils/helper.js"},"callId":"call_001"}
\`\`\`

如果用户没有要求读取文件，请像普通助手一样正常回复，不要输出任何 JSON。
      `,
      {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: '文件的相对路径或绝对路径'
          },
          encoding: {
            type: 'string',
            description: '文件编码，默认 utf-8',
            default: 'utf-8'
          }
        },
        required: ['file_path'],
        additionalProperties: false
      }
    );
  }

  /**
   * 执行文件读取
   * @param {Object} params - { file_path, encoding? }
   * @returns {Promise<ToolResult>}
   */
  async execute(params) {
    const { file_path, encoding = 'utf-8', projectDir } = params;

    try {
      // 规范化路径：将正斜杠转换为反斜杠（Windows兼容）
      const normalizedPath = file_path.replace(/\//g, path.sep);

      // 如果是相对路径且有项目目录，则相对于项目目录解析
      let resolvedPath = normalizedPath;
      if (!path.isAbsolute(normalizedPath) && projectDir) {
        resolvedPath = path.join(projectDir, normalizedPath);
      } else if (!path.isAbsolute(normalizedPath)) {
        // 相对路径但无项目目录，使用当前工作目录
        resolvedPath = path.resolve(normalizedPath);
      } else {
        resolvedPath = normalizedPath;
      }

      // 检查文件是否存在
      if (!fs.existsSync(resolvedPath)) {
        return ToolResult.error(`文件不存在: ${resolvedPath}`);
      }

      // 检查是否是文件
      const stat = fs.statSync(resolvedPath);
      if (!stat.isFile()) {
        return ToolResult.error(`不是文件: ${resolvedPath}`);
      }

      // 限制读取大小 1MB，避免超大文件
      const MAX_SIZE = 1024 * 1024; // 1MB
      const isTruncated = stat.size > MAX_SIZE;

      let content;
      if (isTruncated) {
        // 只读取前 1MB
        const fd = fs.openSync(resolvedPath, 'r');
        const buffer = Buffer.alloc(MAX_SIZE);
        fs.readSync(fd, buffer, 0, MAX_SIZE, 0);
        fs.closeSync(fd);
        content = buffer.toString(encoding);
        // 去除可能的截断导致的半个字符
        content = content.replace(/�/g, '');
      } else {
        content = fs.readFileSync(resolvedPath, encoding);
      }

      const absolutePath = path.resolve(resolvedPath);
      console.log('[FileReadTool] 文件已读取:', absolutePath, '大小:', stat.size, 'bytes');

      return ToolResult.success({
        message: `文件已读取: ${absolutePath}`,
        content: content,
        size: stat.size,
        path: absolutePath,
        truncated: isTruncated
      });
    } catch (err) {
      return ToolResult.error(`读取文件失败: ${err.message}`);
    }
  }
}

module.exports = { FileReadTool };
