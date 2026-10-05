/**
 * 「文件」页内的预览区：点文件 → 文件树右侧显示内容。
 * 只有一条拖拽条（树与内容之间）：拖动 = 内容区变宽、侧栏加宽（树宽度不变、AI 缩窄）。
 * 宽度记忆（localStorage）；✕ 真关闭、切走 tab 临时隐藏并记忆文件。
 */
import { api, escapeHtml } from "./shared.js";

const PREVIEW_W_KEY = "cuckoo-preview-width";
const MIN_PREVIEW_W = 240;
const MAX_PREVIEW_W = 1600;

let baseSidebarWidth = 0;   // 打开预览前的侧栏宽度
let currentRelPath = "";    // 当前预览的文件

function pane(): HTMLElement | null { return document.getElementById("ck-preview-pane"); }
function cols(): HTMLElement | null { return document.querySelector(".ck-files-cols"); }

function getPreviewWidth(): number {
  try {
    const v = Number(localStorage.getItem(PREVIEW_W_KEY));
    if (Number.isFinite(v) && v >= MIN_PREVIEW_W && v <= MAX_PREVIEW_W) return Math.round(v);
  } catch (_) { /* ignore */ }
  return 420;
}
function savePreviewWidth(w: number): void {
  try { localStorage.setItem(PREVIEW_W_KEY, String(w)); } catch (_) { /* ignore */ }
}

function currentSidebarWidth(): number {
  const sb = document.getElementById("ck-sidebar") as any;
  if (!sb) return 320;
  const w = sb.getBoundingClientRect().width;
  return w > 0 ? Math.round(w) : 320;
}

function fmtSize(n: any): string {
  if (typeof n !== "number") return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(2) + " MB";
}

/** 侧栏宽度 = 基础宽 + 预览宽（树宽度不变、AI 缩窄） */
function syncSidebarWidth(previewW: number): void {
  const total = Math.round((baseSidebarWidth || currentSidebarWidth()) + previewW);
  const sb = document.getElementById("ck-sidebar") as any;
  if (sb && !sb.classList.contains("ck-collapsed")) sb.style.width = total + "px";
  if (api.toggleSidebar) api.toggleSidebar(total);
}

async function loadFile(relPath: string): Promise<void> {
  const nameEl = document.getElementById("ck-preview-name");
  const sizeEl = document.getElementById("ck-preview-size");
  const bodyEl = document.getElementById("ck-preview-body");
  if (nameEl) { nameEl.textContent = relPath; nameEl.title = relPath; }
  if (sizeEl) sizeEl.textContent = "";
  if (bodyEl) bodyEl.innerHTML = '<div class="ck-preview-empty">加载中…</div>';
  try {
    const r = await (api as any).readProjectFile(relPath);
    if (!r || !r.success) { if (bodyEl) bodyEl.innerHTML = '<div class="ck-preview-empty">' + escapeHtml((r && r.error) || "读取失败") + '</div>'; return; }
    if (sizeEl) sizeEl.textContent = fmtSize(r.size);
    if (bodyEl) {
      bodyEl.innerHTML = "";
      const pre = document.createElement("pre");
      pre.textContent = r.content;
      bodyEl.appendChild(pre);
    }
  } catch (err: any) {
    if (bodyEl) bodyEl.innerHTML = '<div class="ck-preview-empty">读取失败: ' + escapeHtml(err.message) + '</div>';
  }
}

/** 打开预览：显示某文件内容 + 侧栏加宽 */
export async function openPreview(relPath: string): Promise<void> {
  const p = pane();
  if (!p) return;
  currentRelPath = relPath;
  if (!p.classList.contains("open")) {
    baseSidebarWidth = currentSidebarWidth();
    const w = getPreviewWidth();
    p.style.width = w + "px";
    p.classList.add("open");
    syncSidebarWidth(w);
  }
  await loadFile(relPath);
}

/** 临时隐藏（切走 tab / 收起侧栏）：记住文件 + 缩回侧栏 */
export function hidePreview(): void {
  const p = pane();
  if (!p || !p.classList.contains("open")) return;
  p.classList.remove("open");
  if (baseSidebarWidth > 0) syncSidebarWidth(0);
  baseSidebarWidth = 0;
}

/** 真关闭（点 ✕）：忘掉文件 + 缩回侧栏 */
export function dismissPreview(): void {
  currentRelPath = "";
  hidePreview();
}

/** 恢复之前看的文件（切回「文件」tab 时） */
export function restorePreview(): void {
  if (!currentRelPath) return;
  openPreview(currentRelPath);
}

// ✕ 关闭按钮
document.getElementById("ck-preview-close")?.addEventListener("click", dismissPreview);
// 系统程序打开
document.getElementById("ck-preview-ext")?.addEventListener("click", () => {
  if (currentRelPath && (api as any).openFileExternal) (api as any).openFileExternal(currentRelPath).catch(() => {});
});

// 拖拽条（树与内容之间，位于预览区左缘）：拖动 = 内容变宽、侧栏加宽
{
  const p = pane();
  if (p) {
    const rz = document.createElement("div");
    rz.className = "ck-preview-resizer";
    rz.title = "拖动调整预览宽度";
    p.appendChild(rz);
    rz.addEventListener("mousedown", (e: any) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = p.getBoundingClientRect().width;
      const onMove = (ev: any) => {
        let w = Math.round(startW - (ev.clientX - startX));
        if (w < MIN_PREVIEW_W) w = MIN_PREVIEW_W;
        if (w > MAX_PREVIEW_W) w = MAX_PREVIEW_W;
        p.style.width = w + "px";
        syncSidebarWidth(w);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        savePreviewWidth(Math.round(p.getBoundingClientRect().width));
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }
}
