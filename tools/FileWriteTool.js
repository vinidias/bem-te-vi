const { Tool, ToolResult } = require('./ToolRegistry');
const fs = require('fs');
const path = require('path');

/**
 * 文件写入工具 - 仿照 Claude Code 的 FileWriteTool
 * 用于创建新文件或覆盖现有文件
 */
class FileWriteTool extends Tool {
  constructor() {
    super(
      'file_write',
      `
      你是一个可以使用 "file_write" 工具来写入文件的助手。

工具说明：
- 名称：file_write
- 用途：创建新文件但不能覆盖文件。如果父目录不存在，会自动创建。
- 参数：
  - file_path（字符串，必填）：文件必须是相对路径。 注意不要用 / , 而是用\ 作为目录分隔符 
  - content（字符串，必填）：要写入文件的内容。
  - encoding（字符串，选填）：文件编码，默认为 "utf-8"。仅在需要非默认编码时才包含此参数。

何时使用工具：
如果你觉得需要用户创建新的文件时,请优先使用此工具

使用工具时的回复格式：
- 不要添加任何解释、前缀或后缀。
- JSON 必须严格遵循以下结构：

{
  "tool": "file_write",
  "parameters": {
    "file_path": "<路径>",
    "content": "<内容>"
  }
}

- 仅当用户指定了非默认编码（例如 "utf-16le"）时，才包含 "encoding" 参数。
- 正确转义内容中的特殊字符，以确保 JSON 有效。

示例：
如果你觉得根据用户提出的问题,需要把"Hello, world!" 写入名为 greeting.txt 的文件
你的回复：
{"tool":"file_write","parameters":{"file_path":"greeting.txt","content":"Hello, world!"}}

如果你觉得根据用户提出的问题,需要将以下文本保存到 /tmp/notes.txt：第一行\\n第二行
你的回复：
{"tool":"file_write","parameters":{"file_path":"/tmp/notes.txt","content":"第一行\\n第二行"}}

如果用户没有要求写入文件，请像普通助手一样正常回复，不要输出任何 JSON。
      `,
      {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: '文件的绝对路径或相对路径'
          },
          content: {
            type: 'string',
            description: '要写入的文件内容'
          },
          encoding: {
            type: 'string',
            description: '文件编码，默认 utf-8',
            default: 'utf-8'
          }
        },
        required: ['file_path', 'content'],
        additionalProperties: false
      }
    );
  }

  /**
   * 执行文件写入
   * @param {Object} params - { file_path, content, encoding? }
   * @returns {Promise<ToolResult>}
   */
  async execute(params) {
    const { file_path, content, encoding = 'utf-8', projectDir } = params;

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

      // 确保目录存在
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 写入文件
      fs.writeFileSync(resolvedPath, content, encoding);

      // 获取绝对路径
      const absolutePath = path.resolve(resolvedPath);
      console.log('[FileWriteTool] 文件已写入:', absolutePath);
      console.log('[FileWriteTool] 文件大小:', Buffer.byteLength(content, encoding), 'bytes');
      console.log('[FileWriteTool] 编码:', encoding);

      return ToolResult.success({
        message: `文件已写入: ${absolutePath}`,
        bytes: Buffer.byteLength(content, encoding),
        path: absolutePath
      });
    } catch (err) {
      return ToolResult.error(`写入文件失败: ${err.message}`);
    }
  }
}

module.exports = { FileWriteTool };