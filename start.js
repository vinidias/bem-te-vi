/**
 * 跨平台启动脚本
 * Windows 下设置 UTF-8 控制台编码后启动 Electron；macOS/Linux 直接启动
 * 日志输出到 wyp/log/electron.log
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const isWin = process.platform === 'win32';

// 创建 wyp/log 目录
const logDir = path.join(__dirname, 'wyp', 'log');
fs.mkdirSync(logDir, { recursive: true });

// 每次启动清空日志
try {
  const oldLogs = fs.readdirSync(logDir).filter(f => f.endsWith('.log'));
  for (const f of oldLogs) {
    fs.writeFileSync(path.join(logDir, f), '', 'utf-8');
  }
  console.log('[start.js] 已清空', oldLogs.length, '个日志文件');
} catch (err) {
  console.warn('[start.js] 清空日志失败:', err.message);
}

const logFile = path.join(logDir, 'electron.log');

// --enable-logging 让 renderer console 也进日志文件
// --log-file 指定输出路径
const cmd = isWin
  ? `chcp 65001 > nul && electron . --enable-logging --log-file="${logFile}"`
  : `electron . --enable-logging --log-file="${logFile}"`;

const child = spawn(cmd, {
  shell: true,
  stdio: 'inherit',
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
child.on('error', (err) => {
  console.error('启动失败:', err.message);
  process.exit(1);
});
