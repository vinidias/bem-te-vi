/**
 * 跨平台启动脚本
 * Windows 下设置 UTF-8 控制台编码后启动 Electron；macOS/Linux 直接启动
 */
const { spawn } = require('child_process');

const isWin = process.platform === 'win32';
const cmd = isWin ? 'chcp 65001 > nul && electron .' : 'electron .';

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
