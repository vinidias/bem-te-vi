/**
 * MCP 配置管理
 *
 * mcp.json 采用主流 Claude Desktop 格式（可直接分享/导入）：
 * {
 *   "mcpServers": {
 *     "filesystem": { "command": "npx", "args": [...] },          // stdio
 *     "remote-db":  { "url": "https://..." }                       // http（扩展）
 *   }
 * }
 *
 * 启用/禁用状态单独存 mcp-state.json（不污染主流格式）：
 * { "filesystem": true, "remote-db": false }
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { app } = require('electron');

function getConfigFile(): string {
  return path.join(app.getPath('userData'), 'mcp.json');
}

function getStateFile(): string {
  return path.join(app.getPath('userData'), 'mcp-state.json');
}

function readConfig(): any {
  try {
    const file = getConfigFile();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (err: any) {
    console.error('[MCP] 读取配置失败:', err.message);
  }
  return { mcpServers: {} };
}

function writeConfig(config: any): boolean {
  try {
    const file = getConfigFile();
    fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf-8');
    console.log('[MCP] 配置已保存:', file);
    return true;
  } catch (err: any) {
    console.error('[MCP] 写入配置失败:', err.message);
    return false;
  }
}

function readState(): any {
  try {
    const file = getStateFile();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (err) {}
  return {};
}

function writeState(state: any): boolean {
  try {
    fs.writeFileSync(getStateFile(), JSON.stringify(state, null, 2), 'utf-8');
    return true;
  } catch (err: any) {
    console.error('[MCP] 写入状态失败:', err.message);
    return false;
  }
}

/**
 * 把 mcpServers 对象转成数组（带 name / type / enabled），便于 UI 和 client 使用。
 * type 判断：有 url 就是 http，否则 stdio。
 */
function getServers(): any[] {
  const config = readConfig();
  const state = readState();
  const servers: any[] = [];
  for (const [name, def] of Object.entries(config.mcpServers || {}) as [string, any][]) {
    servers.push({
      name,
      type: def && def.url ? 'http' : 'stdio',
      command: def && def.command,
      args: def && def.args || [],
      url: def && def.url,
      headers: def && def.headers,
      env: def && def.env,
      cwd: def && def.cwd,
      enabled: state[name] !== false, // 默认启用
    });
  }
  return servers;
}

function getEnabledServers(): any[] {
  return getServers().filter(s => s.enabled);
}

function upsertServer(server: any): any {
  const config = readConfig();
  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    config.mcpServers = {};
  }
  const def: any = {};
  if (server.type === 'http') {
    if (server.url) def.url = server.url;
    if (server.headers) def.headers = server.headers;
  } else {
    if (server.command) def.command = server.command;
    if (server.args && server.args.length) def.args = server.args;
    if (server.env) def.env = server.env;
    if (server.cwd) def.cwd = server.cwd;
  }
  config.mcpServers[server.name] = def;
  writeConfig(config);
  return server;
}

function setServerEnabled(name: string, enabled: any): boolean {
  const state = readState();
  state[name] = !!enabled;
  writeState(state);
  return true;
}

function removeServer(name: string): boolean {
  const config = readConfig();
  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    config.mcpServers = {};
  }
  delete config.mcpServers[name];
  writeConfig(config);
  const state = readState();
  delete state[name];
  writeState(state);
  return true;
}

export {
  getConfigFile,
  getStateFile,
  readConfig,
  writeConfig,
  getServers,
  getEnabledServers,
  upsertServer,
  setServerEnabled,
  removeServer,
};
