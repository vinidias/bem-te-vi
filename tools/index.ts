/**
 * 工具库统一入口
 * 导出所有可用工具（主进程注册工具的唯一入口，与 src/main/tool-registry.js 配套）
 */
import { ToolRegistry } from './ToolRegistry.js';
import { JsRunner } from './JsRunner.js';
import { WriteTool } from './WriteTool.js';
import { ReadTool } from './ReadTool.js';
import { ReadLinesTool } from './ReadLinesTool.js';
import { EditTool } from './EditTool.js';
import { GlobToolNew } from './GlobToolNew.js';
import { GrepToolNew } from './GrepToolNew.js';
import { TodoWriteTool } from './TodoWriteTool.js';
import { BashTool } from './BashTool.js';
import { PwshTool } from './PwshTool.js';
import { FileDeleteTool } from './FileDeleteTool.js';
import { WebFetchTool } from './WebFetchTool.js';
import { MySQLTool } from './MySQLTool.js';
import { OpenBrowserWindowTool } from './OpenBrowserWindowTool.js';
import { InjectJSTool } from './InjectJSTool.js';
import { AttachFileTool } from './AttachFileTool.js';
import { McpCallTool } from './McpCallTool.js';
import { McpListServersTool, McpGetToolsTool } from './McpQueryTools.js';

// 创建全局工具注册表
const registry = new ToolRegistry();

// 注册所有工具
registry.register(new WriteTool());
registry.register(new ReadTool());
registry.register(new ReadLinesTool());
registry.register(new EditTool());
registry.register(new GlobToolNew());
registry.register(new GrepToolNew());
registry.register(new TodoWriteTool());
registry.register(new BashTool());
registry.register(new PwshTool());
registry.register(new FileDeleteTool());
registry.register(new WebFetchTool());
registry.register(new MySQLTool());
registry.register(new OpenBrowserWindowTool());
registry.register(new InjectJSTool());
registry.register(new AttachFileTool());
registry.register(new McpCallTool());
registry.register(new McpListServersTool());
registry.register(new McpGetToolsTool());

// JS 工具脚本执行器（单例：AI 生成的 JS 代码调用工具函数）
const jsRunner = new JsRunner(registry);

// 导出
export {
  ToolRegistry,
  JsRunner,
  registry,
  jsRunner,
  WriteTool,
  ReadLinesTool,
  EditTool,
  GlobToolNew,
  GrepToolNew,
  TodoWriteTool,
  BashTool,
  PwshTool,
  FileDeleteTool,
  WebFetchTool,
  // 便捷方法
  getAllTools,
  getToolDescriptions,
  getFormattedToolsForPrompt,
  executeTool
};

function getAllTools(): ToolRegistry { return registry; }
function getToolDescriptions(): any { return registry.getDescriptions(); }
function getFormattedToolsForPrompt(): string { return registry.getFormattedToolsForPrompt(); }
function executeTool(name: string, params: any): Promise<any> { return registry.execute(name, params); }
