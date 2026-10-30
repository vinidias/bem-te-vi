/**
 * IPC：WhatsApp 同步
 *  - 配置读写 / 启停 / 状态查询 / QR（壳页面「WhatsApp」页调用）
 *  - 接收 AI 页面上报（whatsapp-report）→ 按配置推送 WhatsApp
 *  - WhatsApp 来消息 → 按 jid 路由到绑定的窗口 AI 页面
 */
import { createRequire } from 'node:module';
import * as windowState from '../window.js';
import * as whatsappService from '../../whatsapp/service.js';
import { readConfig, writeConfig } from '../../whatsapp/config.js';
import { getProfileById } from '../profile.js';
import { hasRunningSubagent } from '../subagent.js';
import {
  getBindings, addBinding, removeBinding, setActive, findProfileByJid, listWorkspaces, isGroupJid,
} from '../whatsapp-workspaces.js';

const require = createRequire(import.meta.url);
const { ipcMain } = require('electron');

let waInited = false;

/**
 * WhatsApp 来消息 → 按 jid 找到绑定的 profile → 转发给它的 AI 页面。
 * 无绑定则丢弃（避免乱插消息）。
 */
function forwardUserMessage(text: string, jid: string, name: string, lidJid?: string): void {
  // 尝试 PN 和 LID 两种格式匹配（Baileys 7 用 LID）
  let profileId = findProfileByJid(jid);
  if (!profileId && lidJid) profileId = findProfileByJid(lidJid);
  if (!profileId) {
    console.warn('[WhatsApp] 收到消息，但没有窗口绑定该 jid，丢弃。jid=' + jid + (lidJid ? ' (lid=' + lidJid + ')' : ''));
    return;
  }
  const ctx = windowState.getWindowByProfileId(profileId);
  if (!ctx) {
    console.warn('[WhatsApp] jid 已绑定 profile，但窗口未打开，丢弃。profileId=' + profileId);
    return;
  }
  try {
    if (ctx.profileId && hasRunningSubagent(ctx.profileId)) {
      console.log('[WhatsApp] 子代理运行中，拒收 WhatsApp 消息并回提示');
      whatsappService.sendText('AI 正在执行任务，请稍后再发消息。', jid).catch(() => {});
      return;
    }
  } catch (_) { /* ignore */ }
  const view = ctx && ctx.view;
  if (!view || !view.webContents || view.webContents.isDestroyed()) {
    console.warn('[WhatsApp] 目标窗口不可用，消息丢弃');
    return;
  }
  // 激活窗口：确保 AI 页面能正常处理（后台窗口可能不触发某些事件）
  try {
    const win = ctx && ctx.win;
    if (win && !win.isDestroyed()) {
      if (!win.isVisible()) win.show();
      // 不强制抢焦点（用户可能在其他地方），但确保进程活跃
      if (win.isMinimized()) win.restore();
    }
  } catch (_) { /* ignore */ }
  try {
    // 前缀标明来源，让 AI 知道是谁发的（群/联系人）
    const sender = isGroupJid(jid) ? (name + ' @ 群') : name;
    view.webContents.send('whatsapp-user-message', { text, jid, name: sender });
    console.log('[WhatsApp] 已转发消息到 AI 页面, jid=' + jid + ', len=' + text.length);
  } catch (err: any) {
    console.error('[WhatsApp] 转发失败:', err.message);
  }
}

/** 通知所有 AI 页面：WhatsApp 启用状态 */
function broadcastWhatsappMode(enabled: boolean): void {
  for (const ctx of windowState.getAllContexts()) {
    try {
      const v = ctx && ctx.view;
      if (v && v.webContents && !v.webContents.isDestroyed()) {
        v.webContents.send('whatsapp-mode', { enabled });
      }
    } catch (_) { /* ignore */ }
  }
}

/** 启动时初始化：若配置为启用则自动连接 */
function initWhatsapp(): void {
  if (waInited) return;
  waInited = true;
  const cfg = readConfig();
  if (!cfg.enabled) return;
  whatsappService.connect({
    onUserMessage: (text, jid, name, lid) => forwardUserMessage(text, jid, name, lid),
  });
  broadcastWhatsappMode(true);
  console.log('[WhatsApp] 启动时自动连接（已启用）');
}

function registerWhatsappIpc(): void {
  // 查询启用状态
  ipcMain.handle('whatsapp-is-enabled', async () => {
    const cfg = readConfig();
    return { enabled: cfg.enabled === true && whatsappService.isConnected() };
  });

  // 读配置 + 状态
  ipcMain.handle('whatsapp-get-config', async () => {
    const cfg = readConfig();
    const st = whatsappService.getStatus();
    return {
      success: true,
      config: {
        enabled: cfg.enabled,
        pushUserMessage: cfg.pushUserMessage,
        pushAiReply: cfg.pushAiReply,
        pushToolStatus: cfg.pushToolStatus,
        pushToolName: cfg.pushToolName,
      },
      status: st.status,
      statusDetail: st.detail,
      myJid: st.myJid,
    };
  });

  // 保存配置 +（按需）启停连接
  ipcMain.handle('whatsapp-save-config', async (_event: any, { data }: any) => {
    const before = readConfig();
    const ok = writeConfig(data || {});
    if (!ok) return { success: false, error: '保存失败' };
    const cfg = readConfig();
    const connChanged = before.enabled !== cfg.enabled;
    if (!connChanged) return { success: true };
    if (cfg.enabled) {
      await whatsappService.connect({
        onUserMessage: (text, jid, name, lid) => forwardUserMessage(text, jid, name, lid),
      });
      broadcastWhatsappMode(true);
    } else {
      await whatsappService.disconnect();
      broadcastWhatsappMode(false);
    }
    return { success: true };
  });

  // 获取 QR（dataURL PNG）
  ipcMain.handle('whatsapp-get-qr', async () => {
    const st = whatsappService.getStatus();
    const dataUrl = st.status === 'qr' ? await whatsappService.getQRDataURL() : '';
    return { qrDataUrl: dataUrl, status: st.status, detail: st.detail };
  });

  // 重连（生成新 QR）
  ipcMain.handle('whatsapp-reconnect', async () => {
    await whatsappService.connect({
      onUserMessage: (text, jid, name, lid) => forwardUserMessage(text, jid, name, lid),
    });
    broadcastWhatsappMode(true);
    return { success: true };
  });

  // 断开
  ipcMain.handle('whatsapp-disconnect', async () => {
    await whatsappService.disconnect();
    broadcastWhatsappMode(false);
    return { success: true };
  });

  // 列出最近会话（MVP 空，留接口）
  ipcMain.handle('whatsapp-list-chats', async () => {
    return await whatsappService.listChats();
  });

  // 读当前窗口的绑定
  ipcMain.handle('whatsapp-get-binding', async (event: any) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.profileId) return { bindings: [] };
    return { bindings: getBindings(ctx.profileId) };
  });

  // 添加绑定（jid + name + type）
  ipcMain.handle('whatsapp-bind-jid', async (event: any, { jid, name, active }: any) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.profileId) return { success: false, error: 'no-window' };
    if (!jid) return { success: false, error: 'jid vazio' };
    const type = isGroupJid(jid) ? 'group' : 'contact';
    const ok = addBinding(ctx.profileId, { jid, name: name || jid, type, active: active === true });
    return ok ? { success: true, bindings: getBindings(ctx.profileId) } : { success: false, error: '保存失败' };
  });

  // 移除绑定
  ipcMain.handle('whatsapp-unbind-jid', async (event: any, { jid }: any) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.profileId) return { success: false, error: 'no-window' };
    const ok = removeBinding(ctx.profileId, String(jid || ''));
    return ok ? { success: true, bindings: getBindings(ctx.profileId) } : { success: false, error: '保存失败' };
  });

  // 设 active
  ipcMain.handle('whatsapp-set-active', async (event: any, { jid }: any) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.profileId) return { success: false, error: 'no-window' };
    const ok = setActive(ctx.profileId, String(jid || ''));
    return ok ? { success: true, bindings: getBindings(ctx.profileId) } : { success: false, error: '未找到该绑定' };
  });

  // 列出所有 workspace（调试 / 管理页）
  ipcMain.handle('whatsapp-list-workspaces', async () => {
    return { workspaces: listWorkspaces() };
  });

  // AI 页面上报：把消息发到绑定的 WhatsApp 会话
  ipcMain.handle('whatsapp-report', async (event: any, payload: any) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.profileId) return { success: false, error: 'no-window' };
    const cfg = readConfig();
    if (!cfg.enabled) return { success: false, error: 'disabled' };
    const kind = (payload && payload.kind) || 'ai';
    const text = String((payload && payload.text) || '');
    if (!text) return { success: false, error: 'texto vazio' };
    // 找到 active binding
    const bindings = getBindings(ctx.profileId);
    const active = bindings.find((b) => b.active) || bindings[0];
    if (!active) return { success: false, error: 'nenhum jid vinculado' };
    const r = await whatsappService.sendText(text, active.jid);
    if (!r.success) console.warn('[WhatsApp] 推送失败（' + kind + '）:', r.error);
    return r;
  });
}

export { registerWhatsappIpc, initWhatsapp, broadcastWhatsappMode };
