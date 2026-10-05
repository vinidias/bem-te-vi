/**
 * IPC：窗口组（多账号限流轮换）
 */
import { createRequire } from "node:module";
import * as wg from "../window-groups.js";

const require = createRequire(import.meta.url);
const { ipcMain } = require("electron");

function registerWindowGroupsIpc(): void {
  // 列出所有组
  ipcMain.handle("wg-list", async () => {
    return { success: true, groups: wg.listGroups() };
  });

  // 新建组
  ipcMain.handle("wg-create", async (_e: any, { name }: any = {}) => {
    const g = wg.createGroup(name);
    return { success: true, group: g };
  });

  // 把窗口加入组
  ipcMain.handle("wg-add-window", async (_e: any, { groupId, windowId }: any = {}) => {
    const ok = wg.addWindowToGroup(groupId, windowId);
    return { success: ok };
  });

  // 从组移除窗口
  ipcMain.handle("wg-remove-window", async (_e: any, { groupId, windowId }: any = {}) => {
    const ok = wg.removeWindowFromGroup(groupId, windowId);
    return { success: ok };
  });

  // 重命名组
  ipcMain.handle("wg-rename", async (_e: any, { groupId, name }: any = {}) => {
    const ok = wg.renameGroup(groupId, name);
    return { success: ok };
  });

  // 删除组
  ipcMain.handle("wg-delete", async (_e: any, { groupId }: any = {}) => {
    const ok = wg.deleteGroup(groupId);
    return { success: ok };
  });
}

export { registerWindowGroupsIpc };
