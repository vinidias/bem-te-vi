/**
 * IPC：项目初始化
 */
import { createRequire } from 'node:module';
import * as windowState from '../window.js';
import { initProject } from '../../session/project-context.js';

const require = createRequire(import.meta.url);
const { ipcMain } = require('electron');

function registerProjectIpc(): void {
  // 初始化项目
  ipcMain.handle('init-project', async (event: any, { skipPrompt = false, projectDir = null, isCompaction = false }: any = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    return initProject(skipPrompt, ctx, projectDir, isCompaction);
  });
}

export { registerProjectIpc };
