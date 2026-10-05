/**
 * 「文件」页内预览区。
 *
 * 两条拖拽条各司其职：
 *  - 左条（树/内容之间）：改树宽 → 树与内容此消彼长，侧栏总宽不变（AI 不变）
 *  - 右条（侧栏右缘，现成机制）：改侧栏总宽 → 树宽不变，内容区伸缩（AI 变）
 *
 * 实现：打开预览时「树固定宽 + 预览 flex:1」；
 * 左条改树的固定宽（总宽不动），右条改侧栏总宽（现成机制，树固定故内容跟随）。
 */
import { api, escapeHtml } from "./shared.js";

const PREVIEW_W_KEY = "cuckoo-preview-width";
const MIN_PREVIEW_W = 180;
const MIN_TREE_W = 120;

let baseSidebarWidth = 0;   // 打开预览前的侧栏宽度
let currentRelPath = "";

function pane(): HTMLElement | null { return document.getElementById("ck-preview-pane"); }
function listEl(): HTMLElement | null { return document.getElementById("ft-list"); }
function sidebarEl(): HTMLElement | null { return document.getElementById("ck-sidebar"); }
function colsEl(): HTMLElement | null { return document.querySelector(".ck-files-cols"); }

function getPreviewWidth(): number {
  try {
    const v = Number(localStorage.getItem(PREVIEW_W_KEY));
    if (Number.isFinite(v) && v >= MIN_PREVIEW_W && v <= 1600) return Math.round(v);
  } catch (_) { /* ignore */ }
  return 420;
}
function savePreviewWidth(w: number): void {
  try { localStorage.setItem(PREVIEW_W_KEY, String(w)); } catch (_) { /* ignore */ }
}

function currentSidebarWidth(): number {
  const sb = sidebarEl();
  if (!sb) return 320;
  const w = sb.getBoundingClientRect().width;
  return w > 0 ? Math.round(w) : 320;
}

/** 设置侧栏总宽（改 AI 区域） */
function setSidebarWidth(total: number): void {
  const ww = Math.round(total);
  const sb = sidebarEl();
  if (sb && !sb.classList.contains("ck-collapsed")) sb.style.width = ww + "px";
  if (api.toggleSidebar) api.toggleSidebar(ww);
}

function fmtSize(n: any): string {
  if (typeof n !== "number") return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(2) + " MB";
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

/** 打开预览：树固定宽 + 预览 flex:1；侧栏加宽给预览腾空间 */
export async function openPreview(relPath: string): Promise<void> {
  const p = pane();
  if (!p) return;
  currentRelPath = relPath;
  if (!p.classList.contains("open")) {
    const l = listEl();
    baseSidebarWidth = currentSidebarWidth();
    // 树固定当前宽（不再被预览挤压）
    if (l) {
      const treeW = Math.round(l.getBoundingClientRect().width);
      l.style.flex = "0 0 " + treeW + "px";
      l.style.width = treeW + "px";
    }
    p.classList.add("open");
    // 预览占剩余空间
    p.style.flex = "1 1 0";
    p.style.width = "";
    // 侧栏加宽 = 初始预览宽（给预览腾地方）
    setSidebarWidth(baseSidebarWidth + getPreviewWidth());
  }
  await loadFile(relPath);
}

/** 临时隐藏（切走 tab / 收起侧栏）：记住文件 + 缩回侧栏 */
export function hidePreview(): void {
  const p = pane();
  if (!p || !p.classList.contains("open")) return;
  p.classList.remove("open");
  const l = listEl();
  if (l) { l.style.flex = ""; l.style.width = ""; }
  if (baseSidebarWidth > 0) setSidebarWidth(baseSidebarWidth);
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

// 左条（树/内容之间）：改树宽（总宽不变 → AI 不变）
{
  const p = pane();
  if (p) {
    const rz = document.createElement("div");
    rz.className = "ck-preview-resizer";
    rz.title = "拖动调整：文件树 / 内容区";
    p.appendChild(rz);
    rz.addEventListener("mousedown", (e: any) => {
      e.preventDefault();
      const startX = e.clientX;
      const l = listEl();
      const cols = colsEl();
      if (!l || !cols) return;
      const startTreeW = l.getBoundingClientRect().width;
      const totalW = cols.getBoundingClientRect().width;
      const onMove = (ev: any) => {
        let treeW = Math.round(startTreeW + (ev.clientX - startX));
        const maxTree = Math.max(MIN_TREE_W, totalW - MIN_PREVIEW_W);
        if (treeW < MIN_TREE_W) treeW = MIN_TREE_W;
        if (treeW > maxTree) treeW = maxTree;
        l.style.flex = "0 0 " + treeW + "px";
        l.style.width = treeW + "px";
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        // 记忆预览宽（= 总宽 - 树宽）
        const treeW = l.getBoundingClientRect().width;
        savePreviewWidth(Math.max(MIN_PREVIEW_W, Math.round(totalW - treeW)));
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }
}
