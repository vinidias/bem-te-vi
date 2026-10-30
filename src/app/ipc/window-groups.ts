/**
 * IPC：窗口组（多账号限流轮换）
 */
import { createRequire } from "node:module";
import * as wg from "../window-groups.js";
import * as windowState from "../window.js";

const require = createRequire(import.meta.url);
const { ipcMain } = require("electron");

// 窗口组转移分享：发 prepare 指令 → 源窗口清 IDB + 刷新 → 刷新后 checkPendingSwitch 完成分享并回执。
// 因源窗口会刷新（在途 IPC 被打断），改用 switchId 关联（跨刷新），不再请求/响应式。
let switchSeq = 0;
const pendingSwitch = new Map<string, any>();

/** AI 页面回执入口（由 index 注册）：{ switchId, ok, shareId?, sessionId?, error? } */
function onSwitchShareResult(_event: any, payload: any): void {
  const { switchId } = payload || {};
  if (!switchId || !pendingSwitch.has(switchId)) return;
  const p = pendingSwitch.get(switchId);
  pendingSwitch.delete(switchId);
  if (p.timer) clearTimeout(p.timer);
  p.resolve(payload);
}

/** 请求源窗口准备转移分享（事件化：发 prepare，等刷新后的 ready 回执）。返回 { ok, shareId, sessionId, error } */
function requestSwitchShare(windowId: number, timeoutMs = 90000): Promise<any> {
  return new Promise((resolve) => {
    const ctx = windowState.getWindowContext(windowId);
    const view = ctx && ctx.view;
    if (!view || !view.webContents || view.webContents.isDestroyed()) {
      resolve({ ok: false, error: "源窗口不可用" });
      return;
    }
    const switchId = "sw-" + (++switchSeq) + "-" + Date.now();
    const timer = setTimeout(() => {
      if (pendingSwitch.has(switchId)) { pendingSwitch.delete(switchId); resolve({ ok: false, error: "转移分享超时" }); }
    }, timeoutMs);
    pendingSwitch.set(switchId, { resolve, timer });
    try { view.webContents.send("cuckoo-switch-prepare", { switchId }); }
    catch (err: any) { pendingSwitch.delete(switchId); clearTimeout(timer); resolve({ ok: false, error: err.message }); }
  });
}

// 由 entry.ts 注入的"窗口操作"（避免 ipc 层直接依赖 entry 的 createWindow）
let _deps: any = null;
function injectWindowGroupDeps(deps: any): void { _deps = deps; }

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

  // 切换：手动触发"分享当前对话给组内下一个窗口"
  ipcMain.handle("wg-switch", async (_e: any, { groupId }: any = {}) => {
    if (!groupId) return { success: false, error: "缺少 groupId" };
    if (!_deps || typeof _deps.runSwitch !== "function") return { success: false, error: "切换依赖未注入" };
    try {
      return await _deps.runSwitch(groupId, _e.sender);
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });
}

export { registerWindowGroupsIpc, injectWindowGroupDeps, onSwitchShareResult, requestSwitchShare };
