/**
 * 项目目录显示与修改功能
 * 由原 preload.js 拆分而来，逻辑保持不变。
 */
const { ipcRenderer } = require('electron');
const { renderSessions } = require('../dom/session-list');

/**
 * 初始化项目目录区域：默认隐藏、监听目录更新、绑定修改按钮
 */
function initProjectDirSection() {
  // 初始化隐藏（如果没有目录）
  updateProjectDirDisplay(null);

  // 监听主进程的目录更新事件
  ipcRenderer.on('project-dir-updated', (_event, dirPath) => {
    updateProjectDirDisplay(dirPath);
    // 目录更新后刷新会话列表
    renderSessions();
  });

  // 绑定修改按钮事件 - 直接绑定，阻止冒泡和默认行为
  setTimeout(() => {
    const changeBtn = document.getElementById('cuckoo-btn-change-dir');
    if (changeBtn) {
      changeBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        // 使用 updateProjectDir 只更新目录映射，不重新发送初始提示
        const result = await window.electronAPI.updateProjectDir();
        if (result && result.success) {
          // 主进程会发送 project-dir-updated 事件更新显示
          console.log('[Cuckoo Code] 目录已更新');
        } else {
          console.error('修改目录失败:', result?.message);
        }
      });
    }
  }, 100);
}

/**
 * 更新项目目录显示
 * @param {string} dirPath - 目录路径
 */
function updateProjectDirDisplay(dirPath) {
  const display = document.getElementById('cuckoo-project-dir-display');
  if (display) {
    const span = display.querySelector('.cuckoo-dir-path');
    if (span) {
      span.textContent = dirPath || '未选择';
    }
  }
  // 控制整个section的显示隐藏
  const section = document.querySelector('.cuckoo-project-dir-section');
  if (section) {
    if (dirPath && dirPath.trim() !== '') {
      section.style.display = '';
    } else {
      section.style.display = 'none';
    }
  }
}

module.exports = { initProjectDirSection, updateProjectDirDisplay };
