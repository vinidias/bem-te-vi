/**
 * 工具库统一入口
 * 导出所有可用工具
 */
const { ToolRegistry } = require('./ToolRegistry');
const { FileWriteTool } = require('./FileWriteTool');

// 创建全局工具注册表
const registry = new ToolRegistry();

// 注册所有工具
registry.register(new FileWriteTool());

// 导出
module.exports = {
  ToolRegistry,
  registry,
  FileWriteTool,
  // 便捷方法
  getAllTools: () => registry,
  getToolDescriptions: () => registry.getDescriptions(),
  getFormattedToolsForPrompt: () => registry.getFormattedToolsForPrompt(),
  executeTool: (name, params) => registry.execute(name, params)
};