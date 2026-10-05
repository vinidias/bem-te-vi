/**
 * 文件预览覆盖视图 preload（只读查看项目文件）。
 * 暴露 window.fileAPI：请求内容 + 用系统程序打开 + 关闭。
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { contextBridge, ipcRenderer } = require("electron");

const fileAPI = {
  /** 读取文件内容（主进程在窗口上下文里带上项目根目录） */
  read: (relPath: string) => ipcRenderer.invoke("read-project-file", { relPath }),
  /** 用系统默认程序打开 */
  openExternal: (relPath: string) => ipcRenderer.invoke("open-project-file-external", { relPath }),
  /** 关闭预览（回缩到网页） */
  close: () => ipcRenderer.invoke("file-preview-close"),
  /** 页面就绪：主进程随后推送要显示的文件 */
  ready: () => ipcRenderer.send("file-preview-ready"),
  /** 订阅"显示某文件" */
  onShow: (cb: (payload: any) => void) => { ipcRenderer.on("file-preview-show", (_e: any, payload: any) => cb(payload)); },
};

try { contextBridge.exposeInMainWorld("fileAPI", fileAPI); } catch (err) { console.error("[FilePreview] contextBridge 失败:", err); }
(window as any).fileAPI = fileAPI;

export {};
