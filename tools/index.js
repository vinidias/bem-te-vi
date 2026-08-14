/**
 * 工具库统一入口
 * 导出所有可用工具
 */
const { ToolRegistry } = require('./ToolRegistry');
const { JsRunner } = require('./JsRunner');
const { FileWriteTool } = require('./FileWriteTool');
const { FileReadTool } = require('./FileReadTool');
const { FileEditTool } = require('./FileEditTool');
const { GlobTool } = require('./GlobTool');
const { GrepTool } = require('./GrepTool');
const { BashTool } = require('./BashTool');

// 创建全局工具注册表
const registry = new ToolRegistry();

// 注册所有工具
registry.register(new FileWriteTool());
registry.register(new FileReadTool());
registry.register(new FileEditTool());
registry.register(new GlobTool());
registry.register(new GrepTool());
registry.register(new BashTool());

// 导出
module.exports = {
  ToolRegistry,
  JsRunner,
  registry,
  FileWriteTool,
  FileReadTool,
  FileEditTool,
  GlobTool,
  GrepTool,
  BashTool,
  // 便捷方法
  getAllTools: () => registry,
  getToolDescriptions: () => registry.getDescriptions(),
  getFormattedToolsForPrompt: () => registry.getFormattedToolsForPrompt(),
  executeTool: (name, params) => registry.execute(name, params)
};