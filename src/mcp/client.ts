/**
 * MCP Client 管理
 * 连接/管理多个 MCP server（stdio + HTTP），提供工具列表和调用能力。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as mcpConfig from './config.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// electron 特殊：其 index.js 导出字符串，须用 createRequire（见 P3a 手册 1.5）
const require = createRequire(import.meta.url);
const { app } = require('electron');

// server name -> { client, transport, tools, connected }
const connections = new Map<string, any>();
// server name -> Promise<entry>：连接进行中的缓存，避免并发重复连接（如启动与初始化同时触发）
const connecting = new Map<string, Promise<any>>();

// 默认工作目录缓存（探测一次）
let defaultCwdCache: string | undefined;
let defaultCwdResolved = false;

/**
 * 计算 MCP 子进程的默认工作目录。
 * 优先「程序目录/mcp-cwd」，不可写时回退「userData/mcp-cwd」。
 * 覆盖各平台、各安装方式（ZIP/Portable 可写程序目录；Program Files/macOS 不可写则落 userData）。
 * @returns {string|undefined} 可写目录的绝对路径；全部失败返回 undefined（子进程继承父进程 cwd）
 */
function getDefaultMcpCwd(): string | undefined {
  if (defaultCwdResolved) return defaultCwdCache;
  defaultCwdResolved = true;

  const candidates: string[] = [];
  // portable 版：程序运行时解压到临时目录，exe 路径不可靠，用 electron-builder 提供的
  // PORTABLE_EXECUTABLE_DIR（指向用户放置 portable exe 的真实目录）
  if (app.isPackaged && process.env.PORTABLE_EXECUTABLE_DIR) {
    candidates.push(path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'mcp-cwd'));
  }
  // 打包后：程序目录优先（便于用户删除程序目录时一并清理）
  if (app.isPackaged) {
    try {
      const exeDir = path.dirname(app.getPath('exe'));
      candidates.push(path.join(exeDir, 'mcp-cwd'));
    } catch (_) {}
  }
  // userData 兜底（始终可写；开发环境也走这里）
  try {
    candidates.push(path.join(app.getPath('userData'), 'mcp-cwd'));
  } catch (_) {}

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, '.write-test');
      fs.writeFileSync(probe, '');
      fs.unlinkSync(probe);
      defaultCwdCache = dir;
      console.log('[MCP] 默认工作目录:', dir);
      return dir;
    } catch (_) {
      console.warn('[MCP] 工作目录不可写，尝试下一个:', dir);
    }
  }
  console.warn('[MCP] 未找到可写的默认工作目录，子进程将继承父进程 cwd');
  return undefined;
}

async function connectServer(server: any): Promise<any> {
  if (connections.has(server.name)) {
    return connections.get(server.name);
  }
  // 已有连接进行中：复用同一个 Promise，避免 spawn 多个子进程/重复建连
  if (connecting.has(server.name)) {
    return connecting.get(server.name);
  }

  const p = doConnectServer(server);
  connecting.set(server.name, p);
  try {
    return await p;
  } finally {
    connecting.delete(server.name);
  }
}

async function doConnectServer(server: any): Promise<any> {
  let transport: any;
  if (server.type === 'stdio') {
    transport = new StdioClientTransport({
      command: server.command,
      args: server.args || [],
      env: server.env || {},
      cwd: server.cwd || getDefaultMcpCwd(),
      stderr: 'pipe',
    });
  } else if (server.type === 'http') {
    transport = new StreamableHTTPClientTransport(server.url, {
      requestInit: server.headers ? { headers: server.headers } : undefined,
    });
  } else {
    throw new Error('未知 MCP server 类型: ' + server.type);
  }

  const client = new Client({ name: 'cuckoo-code', version: '0.2.4' });
  await client.connect(transport);

  let tools: any[] = [];
  try {
    const result = await client.listTools({});
    tools = result.tools || [];
  } catch (err: any) {
    console.error('[MCP] 获取工具列表失败:', server.name, err.message);
  }

  const entry = { client, transport, tools, connected: true };
  connections.set(server.name, entry);
  console.log('[MCP] 已连接:', server.name, '工具数=', tools.length);
  return entry;
}

async function disconnectServer(name: string): Promise<void> {
  // 若有连接进行中，先等它结束，避免断开后又被它重新登记
  if (connecting.has(name)) {
    try { await connecting.get(name); } catch (_) {}
  }
  const entry = connections.get(name);
  if (!entry) return;
  try {
    await entry.client.close();
  } catch (_) {}
  connections.delete(name);
  console.log('[MCP] 已断开:', name);
}

async function refreshServerTools(name: string): Promise<any[]> {
  const entry = connections.get(name);
  if (!entry) return [];
  try {
    const result = await entry.client.listTools({});
    entry.tools = result.tools || [];
    return entry.tools;
  } catch (err: any) {
    console.error('[MCP] 刷新工具列表失败:', name, err.message);
    return entry.tools || [];
  }
}

async function connectEnabledServers(): Promise<string[]> {
  const servers = mcpConfig.getEnabledServers();
  for (const server of servers) {
    try {
      await connectServer(server);
    } catch (err: any) {
      console.error('[MCP] 连接失败:', server.name, err.message);
    }
  }
  return Array.from(connections.keys());
}

async function connectServerByName(name: string): Promise<any> {
  const server = mcpConfig.getServers().find(s => s.name === name && s.enabled);
  if (!server) throw new Error('MCP server 不存在或未启用: ' + name);
  return connectServer(server);
}

async function disconnectServerByName(name: string): Promise<void> {
  await disconnectServer(name);
}

async function callMcpTool(serverName: string, toolName: string, args: any): Promise<any> {
  let entry = connections.get(serverName);
  if (!entry) {
    entry = await connectServerByName(serverName);
  }
  const result = await entry.client.callTool({ name: toolName, arguments: args });
  return result;
}

function getConnectedServers(): any[] {
  const out: any[] = [];
  for (const [name, entry] of connections) {
    out.push({ name, tools: entry.tools, connected: entry.connected });
  }
  return out;
}

function getMcpToolList(): any[] {
  const out: any[] = [];
  for (const [serverName, entry] of connections) {
    for (const tool of entry.tools) {
      out.push({
        server: serverName,
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema || {},
      });
    }
  }
  return out;
}

/**
 * 列出所有已配置的 MCP server（含启用状态和连接状态）
 * @returns {Array<{name, type, enabled, connected, toolCount}>}
 */
function listConfiguredServers(): any[] {
  const servers = mcpConfig.getServers();
  return servers.map(s => {
    const entry = connections.get(s.name);
    return {
      name: s.name,
      type: s.type,
      enabled: s.enabled,
      connected: !!(entry && entry.connected),
      toolCount: entry ? entry.tools.length : 0,
    };
  });
}

/**
 * 获取指定 server 的工具列表（按需连接）
 * @param {string} name server 名称
 * @returns {Array<{name, description, inputSchema}>}
 */
async function getToolsByServer(name: string): Promise<any[]> {
  let entry = connections.get(name);
  if (!entry) {
    entry = await connectServerByName(name);
  }
  return entry.tools.map((t: any) => ({
    name: t.name,
    description: t.description || '',
    inputSchema: t.inputSchema || {},
  }));
}

export {
  connectServer,
  disconnectServer,
  refreshServerTools,
  connectEnabledServers,
  connectServerByName,
  disconnectServerByName,
  callMcpTool,
  getConnectedServers,
  getMcpToolList,
  listConfiguredServers,
  getToolsByServer,
  getDefaultMcpCwd,
};
