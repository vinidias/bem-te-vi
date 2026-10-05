/**
 * 侧栏内「文件预览」区：点文件 → 右侧分栏显示内容，侧栏自动加宽。
 * 预览宽度可拖拽并记忆（localStorage）。
 *
 * 两种"关掉"：
 *  - 点 ✕（dismiss）：真关闭，忘掉文件，切回来不恢复
 *  - 切走 tab / 收起侧栏（hide）：临时隐藏，记住文件，切回来自动恢复
 */
import { api, escapeHtml } from "./shared.js";

const PREVIEW_W_KEY = "cuckoo-preview-width";
const MIN_PREVIEW_W = 260;
const MAX_PREVIEW_W = 1600;

let baseSidebarWidth = 0;   // 打开预览前的侧栏宽度（缩回时用）
let currentRelPath = "";    // 当前预览的文件（供"切回来恢复"）

function pane(): HTMLElement | null { return document.getElementById("ck-preview-pane"); }

/** 预览区宽度（记忆） */
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

/** 当前侧栏宽度（不含预览） */
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

/** 同时改壳页面侧栏宽度 + 让主进程重排 AI 视图 */
function applySidebarWidth(w: number): void {
  const ww = Math.round(w);
  const sb = document.getElementById("ck-sidebar") as any;
  if (sb && !sb.classList.contains("ck-collapsed")) sb.style.width = ww + "px";
  if (api.toggleSidebar) api.toggleSidebar(ww);
}

/** 显示预览区（不读内容，仅切换显示 + 加宽） */
function showPane(): void {
  const p = pane();
  if (!p || p.classList.contains("open")) return;
  baseSidebarWidth = currentSidebarWidth();
  p.style.width = getPreviewWidth() + "px";
  p.classList.add("open");
  applySidebarWidth(baseSidebarWidth + getPreviewWidth());
}

/** 加载并显示某文件 */
async function loadFile(relPath: string): Promise<void> {
  const nameEl = document.getElementById("ck-preview-name");
  const sizeEl = document.getElementById("ck-preview-size");
  const bodyEl = document.getElementById("ck-preview-body");
  if (nameEl) { nameEl.textContent = relPath; nameEl.title = relPath; }
  if (sizeEl) sizeEl.textContent = "";
  if (bodyEl) bodyEl.innerHTML = '<div class="ck-preview-empty">加载中…</div>';
  try {
    const r = await (api as any).openFilePreview(relPath);
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

/** 打开预览：显示某文件内容，侧栏加宽 */
export async function openPreview(relPath: string): Promise<void> {
  if (!pane()) return;
  currentRelPath = relPath;
  showPane();
  await loadFile(relPath);
}

/** 临时隐藏（切走 tab / 收起侧栏）：记住文件，缩回侧栏 */
export function hidePreview(): void {
  const p = pane();
  if (!p || !p.classList.contains("open")) return;
  p.classList.remove("open");
  if (baseSidebarWidth > 0) applySidebarWidth(baseSidebarWidth);
  baseSidebarWidth = 0;
}

/** 真关闭（点 ✕）：忘掉文件 + 缩回侧栏 */
export function dismissPreview(): void {
  currentRelPath = "";
  hidePreview();
}

/** 恢复到之前看的文件（切回「文件」tab 时调用） */
export function restorePreview(): void {
  if (!currentRelPath) return;
  openPreview(currentRelPath);
}

/** 是否当前有"已记住"的预览 */
export function hasPreview(): boolean {
  return !!currentRelPath;
}

// ✕ 关闭按钮 → 真关闭
document.getElementById("ck-preview-close")?.addEventListener("click", dismissPreview);
// 系统程序打开
document.getElementById("ck-preview-ext")?.addEventListener("click", () => {
  if (currentRelPath && (api as any).openFileExternal) (api as any).openFileExternal(currentRelPath).catch(() => {});
});

// 拖拽预览区左缘：调整预览宽度（同步调侧栏总宽）
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
        applySidebarWidth((baseSidebarWidth || currentSidebarWidth()) + w);
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
