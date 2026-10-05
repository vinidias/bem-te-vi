/**
 * IPC：文件预览覆盖视图（打开/关闭）
 */
import { createRequire } from "node:module";
import * as windowState from "../window.js";

const require = createRequire(import.meta.url);
const { ipcMain } = require("electron");

function registerFilePreviewIpc(): void {
  // 打开文件预览（relPath 相对项目根目录）
  ipcMain.handle("file-preview-open", async (event: any, { relPath }: any) => {
    const ctx: any = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.win || ctx.win.isDestroyed()) return { success: false, error: "无窗口" };
    try { ctx.win.__ckToggleFilePreview?.(true, relPath); return { success: true }; }
    catch (err: any) { return { success: false, error: err.message }; }
  });

  // 关闭文件预览
  ipcMain.handle("file-preview-close", async (event: any) => {
    const ctx: any = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.win || ctx.win.isDestroyed()) return { success: false };
    try { ctx.win.__ckToggleFilePreview?.(false); return { success: true }; }
    catch (err: any) { return { success: false, error: err.message }; }
  });

  // 页面就绪（预留）
  ipcMain.on("file-preview-ready", () => { /* no-op */ });
}

export { registerFilePreviewIpc };
