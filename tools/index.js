/**
 * 工具库统一入口
 * 导出所有可用工具（主进程注册工具的唯一入口，与 src/main/tool-registry.js 配套）
 */
const { ToolRegistry } = require('./ToolRegistry');
const { JsRunner } = require('./JsRunner');
const { FileWriteTool } = require('./FileWriteTool');
const { FileReadTool } = require('./FileReadTool');
const { ReadTool } = require('./ReadTool');
const { FileEditTool } = require('./FileEditTool');
const { GlobTool } = require('./GlobTool');
const { GrepTool } = require('./GrepTool');
const { BashTool } = require('./BashTool');
const { FileDeleteTool } = require('./FileDeleteTool');
const { WebFetchTool } = require('./WebFetchTool');

// 创建全局工具注册表
const registry = new ToolRegistry();

// 注册所有工具
registry.register(new FileWriteTool());
registry.register(new FileReadTool());
registry.register(new ReadTool());
registry.register(new FileEditTool());
registry.register(new GlobTool());
registry.register(new GrepTool());
registry.register(new BashTool());
registry.register(new FileDeleteTool());
registry.register(new WebFetchTool());

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
  FileDeleteTool,
  WebFetchTool,
  // 便捷方法
  getAllTools: () => registry,
  getToolDescriptions: () => registry.getDescriptions(),
  getFormattedToolsForPrompt: () => registry.getFormattedToolsForPrompt(),
  executeTool: (name, params) => registry.execute(name, params)
};
