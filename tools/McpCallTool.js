const { Tool, ToolResult } = require('./ToolRegistry');

/**
 * MCP 调用工具 - 让 AI 通过 mcpCall 调用外部 MCP server 的工具。
 */
class McpCallTool extends Tool {
  constructor() {
    super(
      'mcp_call',
      '调用 MCP server 提供的工具。传入 server 名称、工具名和参数。',
      {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'MCP server 名称' },
          tool: { type: 'string', description: '要调用的工具名' },
          args: { type: 'object', description: '工具参数对象' }
        },
        required: ['server', 'tool'],
        additionalProperties: false
      },
      'mcpCall(server, tool, args)'
    );
  }

  getPromptSection() {
    return {
      name: 'tool:mcp',
      order: 118,
      text: '调用 MCP 工具时使用 mcpCall(server, tool, args)。可用的 MCP server 和工具列表在系统提示词的「MCP 工具」部分。'
    };
  }

  async execute(params) {
    const { server, tool, args } = params;
    try {
      if (!server || typeof server !== 'string') {
        return ToolResult.error('server 不能为空');
      }
      if (!tool || typeof tool !== 'string') {
        return ToolResult.error('tool 不能为空');
      }
      const mcpClient = require('../src/main/mcp-client');
      const result = await mcpClient.callMcpTool(server, tool, args || {});
      return ToolResult.success({
        content: result.content || [],
        isError: result.isError || false,
      });
    } catch (err) {
      return ToolResult.error('MCP 调用失败: ' + (err.message || String(err)));
    }
  }
}

module.exports = { McpCallTool };
