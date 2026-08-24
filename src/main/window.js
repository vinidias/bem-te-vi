/**
 * 主窗口引用管理
 * 由原 main.js 中的全局 mainWindow / sidebarWindow 变量拆分而来。
 */
let mainWindow = null;
let sidebarWindow = null;

function getMainWindow() { return mainWindow; }
function setMainWindow(w) { mainWindow = w; }

module.exports = { getMainWindow, setMainWindow };
