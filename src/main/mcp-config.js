/**
 * MCP 配置管理
 * 配置文件位置：%APPDATA%/cuckoo-ai-pro-session/mcp.json
 * 结构：{ servers: [ { name, type: 'stdio'|'http', enabled, ... } ] }
 */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

function getConfigFile() {
  return path.join(app.getPath('userData'), 'mcp.json');
}

function readConfig() {
  try {
    const file = getConfigFile();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (err) {
    console.error('[MCP] 读取配置失败:', err.message);
  }
  return { servers: [] };
}

function writeConfig(config) {
  try {
    const file = getConfigFile();
    fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf-8');
    console.log('[MCP] 配置已保存:', file);
    return true;
  } catch (err) {
    console.error('[MCP] 写入配置失败:', err.message);
    return false;
  }
}

function getServers() {
  return readConfig().servers || [];
}

function getEnabledServers() {
  return getServers().filter(s => s.enabled);
}

function upsertServer(server) {
  const config = readConfig();
  const servers = config.servers || [];
  const idx = servers.findIndex(s => s.name === server.name);
  if (idx >= 0) {
    servers[idx] = { ...servers[idx], ...server };
  } else {
    servers.push(server);
  }
  config.servers = servers;
  writeConfig(config);
  return server;
}

function setServerEnabled(name, enabled) {
  const config = readConfig();
  const servers = config.servers || [];
  const target = servers.find(s => s.name === name);
  if (!target) return false;
  target.enabled = !!enabled;
  writeConfig(config);
  return true;
}

function removeServer(name) {
  const config = readConfig();
  config.servers = (config.servers || []).filter(s => s.name !== name);
  writeConfig(config);
  return true;
}

module.exports = {
  getConfigFile,
  readConfig,
  writeConfig,
  getServers,
  getEnabledServers,
  upsertServer,
  setServerEnabled,
  removeServer,
};
