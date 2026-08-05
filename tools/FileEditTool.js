const { Tool, ToolResult } = require('./ToolRegistry');
const fs = require('fs');
const path = require('path');

/**
 * 文件编辑工具 - 仿照 Claude Code 的 Edit 工具
 * 在文件中精确替换一段文本（old_string → new_string）
 */
class FileEditTool extends Tool {
  constructor() {
    super(
      'file_edit',
      `
      你是一个可以使用 "file_edit" 工具来编辑文件的助手。

工具说明：
- 名称：file_edit
- 用途：在已有文件中精确查找一段文本并替换为新文本。适用于修改文件的部分内容。
- 参数：
  - file_path（字符串，必填）：文件的相对路径或绝对路径。 不要用 / , 而是用\ 作为目录分隔符
  - old_string（字符串，必填）：要查找的旧文本，必须与文件中的内容精确匹配（包括空格、换行）。
  - new_string（字符串，必填）：要替换成的新文本。
  - replace_all（布尔值，选填）：如果 old_string 在文件中出现多次，设为 true 则全部替换；默认 false（多次匹配会报错）。

注意事项：
- old_string 必须精确匹配文件中的现有内容，建议截取足够长的唯一片段，避免匹配到多处。
- 如果替换后想要插入新内容到指定位置，可以把 old_string 设为锚点文本，new_string 设为 锚点+新内容。

使用工具时的回复格式：
- 不要添加任何解释、前缀或后缀。
- 将 JSON 输出在标准的 Markdown 代码块中（\`\`\`json），并确保内容正确转义：

\`\`\`json
{"toolName":"file_edit","params":{"file_path":"<路径>","old_string":"<要查找的旧文本>","new_string":"<要替换的新文本>"},"callId":"唯一调用ID"}
\`\`\`

- old_string/new_string 中的换行转义为 \\n，双引号转义为 \\"，反斜杠转义为 \\\\
- 输出前检查：JSON 必须合法（括号配对、逗号正确、转义完整）

示例：
\`\`\`json
{"toolName":"file_edit","params":{"file_path":"src/utils/helper.js","old_string":"export function formatDate","new_string":"export function formatTime"},"callId":"call_001"}
\`\`\`

如果用户没有要求修改文件，请像普通助手一样正常回复，不要输出任何 JSON。
      `,
      {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: '文件的相对路径或绝对路径'
          },
          old_string: {
            type: 'string',
            description: '要查找的旧文本，必须精确匹配文件内容'
          },
          new_string: {
            type: 'string',
            description: '要替换成的新文本'
          },
          replace_all: {
            type: 'boolean',
            description: '出现多次时是否全部替换，默认 false',
            default: false
          }
        },
        required: ['file_path', 'old_string', 'new_string'],
        additionalProperties: false
      }
    );
  }

  /**
   * 执行文件编辑（精确替换）
   * @param {Object} params - { file_path, old_string, new_string, replace_all? }
   * @returns {Promise<ToolResult>}
   */
  async execute(params) {
    const { file_path, old_string, new_string, replace_all = false, projectDir } = params;

    try {
      if (old_string === undefined || old_string === null || old_string === '') {
        return ToolResult.error('old_string 不能为空');
      }
      if (new_string === undefined || new_string === null) {
        return ToolResult.error('new_string 不能为空');
      }

      // 规范化路径：将正斜杠转换为反斜杠（Windows兼容）
      const normalizedPath = file_path.replace(/\//g, path.sep);

      // 如果是相对路径且有项目目录，则相对于项目目录解析
      let resolvedPath = normalizedPath;
      if (!path.isAbsolute(normalizedPath) && projectDir) {
        resolvedPath = path.join(projectDir, normalizedPath);
      } else if (!path.isAbsolute(normalizedPath)) {
        resolvedPath = path.resolve(normalizedPath);
      } else {
        resolvedPath = normalizedPath;
      }

      // 检查文件是否存在
      if (!fs.existsSync(resolvedPath)) {
        return ToolResult.error(`文件不存在: ${resolvedPath}`);
      }

      // 读取文件内容
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      console.log("content",JSON.stringify(content))

      // 检查 old_string 出现的次数
      const occurrences = content.split(old_string).length - 1;
      if (occurrences === 0) {
        return ToolResult.error(`未找到要替换的文本，请检查 old_string 是否与文件内容精确匹配。文件路径: ${resolvedPath}`);
      }

      if (occurrences > 1 && !replace_all) {
        return ToolResult.error(`old_string 在文件中出现 ${occurrences} 次，请提供更长的唯一片段，或设置 replace_all: true`);
      }

      // 执行替换
      const newContent = replace_all
        ? content.split(old_string).join(new_string)
        : content.replace(old_string, new_string);

      // 写回文件
      fs.writeFileSync(resolvedPath, newContent, 'utf-8');

      const absolutePath = path.resolve(resolvedPath);
      console.log(`[FileEditTool] 文件已编辑: ${absolutePath}, 替换 ${occurrences} 处`);

      return ToolResult.success({
        message: `文件已编辑: ${absolutePath}`,
        path: absolutePath,
        replacedCount: occurrences,
        bytes: Buffer.byteLength(newContent, 'utf-8')
      });
    } catch (err) {
      return ToolResult.error(`编辑文件失败: ${err.message}`);
    }
  }
}

module.exports = { FileEditTool };
