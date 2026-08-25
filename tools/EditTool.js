const { Tool, ToolResult } = require('./ToolRegistry');
const fs = require('fs');
const path = require('path');

/**
 * 校验 edit 参数（对齐 dsh parseEditArgs）：
 * - file_path trim 后非空
 * - old_string 非空
 * - old_string !== new_string（避免 no-op）
 */
function parseEditArgs(filePath, oldString, newString, replaceAll) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error('file_path must be a non-empty string');
  }
  if (typeof oldString !== 'string' || oldString.length === 0) {
    throw new Error('old_string must be a non-empty string');
  }
  if (typeof newString !== 'string') {
    throw new Error('new_string must be a string');
  }
  if (oldString === newString) {
    throw new Error('old_string and new_string must differ');
  }
  return {
    filePath,
    oldString,
    newString,
    replaceAll: replaceAll === true,
  };
}

/**
 * 对齐 dsh formatEditOutput：Claude-style 确认语。
 */
function formatEditOutput(displayPath, replaceAll) {
  return replaceAll
    ? 'The file ' + displayPath + ' has been updated. All occurrences were successfully replaced.'
    : 'The file ' + displayPath + ' has been updated successfully.';
}

/**
 * edit 工具 - 仿照 dsh 的 edit。
 * 对现有 UTF-8 文本文件做精确字符串替换。
 */
class EditTool extends Tool {
  constructor() {
    super(
      'edit',
      '对现有 UTF-8 文本文件做精确替换（old_string → new_string）。默认 old_string 必须唯一匹配；多匹配可设置 replace_all。',
      {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: '要编辑的文件路径（相对路径基于项目根目录，或绝对路径）'
          },
          old_string: {
            type: 'string',
            description: '要替换的字面文本，必须与文件内容精确匹配'
          },
          new_string: {
            type: 'string',
            description: '替换后的字面文本。可用空字符串删除匹配内容'
          },
          replace_all: {
            type: 'boolean',
            description: '是否替换所有匹配。默认 false；false 时 old_string 必须唯一匹配',
            default: false
          }
        },
        required: ['file_path', 'old_string', 'new_string'],
        additionalProperties: false
      },
      'edit(filePath, oldString, newString, replaceAll?)'
    );
  }

  async execute(params) {
    const { file_path, old_string, new_string, replace_all, projectDir } = params;

    try {
      const input = parseEditArgs(file_path, old_string, new_string, replace_all);

      // 路径解析：相对路径基于 projectDir
      const normalizedPath = input.filePath.replace(/\//g, path.sep);
      let resolvedPath = normalizedPath;
      if (!path.isAbsolute(normalizedPath) && projectDir) {
        resolvedPath = path.join(projectDir, normalizedPath);
      } else if (!path.isAbsolute(normalizedPath)) {
        resolvedPath = path.resolve(normalizedPath);
      }

      // 文件存在性与类型检查
      if (!fs.existsSync(resolvedPath)) {
        return ToolResult.error('文件不存在: ' + resolvedPath);
      }
      const stat = fs.statSync(resolvedPath);
      if (!stat.isFile()) {
        return ToolResult.error('不是文件: ' + resolvedPath);
      }

      // 读取文件内容
      const content = fs.readFileSync(resolvedPath, 'utf-8');

      // 统计 old_string 出现次数
      const occurrences = content.split(input.oldString).length - 1;
      if (occurrences === 0) {
        return ToolResult.error('未找到要替换的文本，请检查 old_string 是否与文件内容精确匹配。文件路径: ' + resolvedPath);
      }
      if (occurrences > 1 && !input.replaceAll) {
        return ToolResult.error('old_string 在文件中出现 ' + occurrences + ' 次，请提供更长的唯一片段，或设置 replace_all: true');
      }

      // 执行替换
      const newContent = input.replaceAll
        ? content.split(input.oldString).join(input.newString)
        : content.replace(input.oldString, input.newString);

      fs.writeFileSync(resolvedPath, newContent, 'utf-8');

      console.log('[EditTool] 已编辑:', resolvedPath, '替换', occurrences, '处');
      return ToolResult.success(formatEditOutput(input.filePath, input.replaceAll));
    } catch (err) {
      return ToolResult.error('编辑文件失败: ' + err.message);
    }
  }
}

module.exports = { EditTool, parseEditArgs, formatEditOutput };
