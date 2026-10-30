/**
 * WhatsApp 同步：Baileys 客户端封装
 *
 * 与 feishu/client.ts 同构：connect / disconnect / sendText / listChats / getStatus。
 * 事件回调 onUserMessage(text, jid, name) 供上层路由到窗口。
 *
 * 凭据存放在 getAuthDir()（multi-file auth）；Baileys 自动保存，无需手动管理。
 */
import { createRequire } from 'node:module';
import { readConfig, getAuthDir } from './config.js';

const require = createRequire(import.meta.url);

type WhatsappStatus = 'disconnected' | 'connecting' | 'qr' | 'connected' | 'error';

interface WhatsappCallbacks {
  /** 收到用户消息（文本） */
  onUserMessage?: (text: string, jid: string, name: string, lidJid?: string) => void;
  /** 状态变化 */
  onStatusChange?: (status: WhatsappStatus, detail?: string) => void;
}

interface WhatsappChat {
  jid: string;
  name: string;
  isGroup: boolean;
}

let currentStatus: WhatsappStatus = 'disconnected';
let statusDetail = '';
let callbacks: WhatsappCallbacks = {};
let sock: any = null;
let lastQR = '';
let myJid = '';

function setStatus(s: WhatsappStatus, detail?: string): void {
  currentStatus = s;
  statusDetail = detail || '';
  try { callbacks.onStatusChange?.(s, statusDetail); } catch (_) { /* ignore */ }
  console.log('[WhatsApp] 状态:', s, statusDetail ? '(' + statusDetail + ')' : '');
}

function getStatus(): { status: WhatsappStatus; detail: string; myJid: string } {
  return { status: currentStatus, detail: statusDetail, myJid };
}

function getQR(): string {
  return lastQR;
}

/** QR como data URL PNG (para exibir no shell) */
async function getQRDataURL(): Promise<string> {
  if (!lastQR) return '';
  try {
    const QRCode = require('qrcode');
    return await QRCode.toDataURL(lastQR, { width: 320, margin: 2 });
  } catch (err: any) {
    console.error('[WhatsApp] QR 生成失败:', err && err.message);
    return '';
  }
}

/** 启动连接（幂等：先断开旧的） */
async function connect(cb?: WhatsappCallbacks): Promise<{ success: boolean; error?: string }> {
  if (cb) callbacks = cb;
  if (sock) await disconnect(true);
  setStatus('connecting');

  try {
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
    const { state, saveCreds } = await useMultiFileAuthState(getAuthDir());

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['Bem-te-vi', 'Chrome', '1.0.0'],
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        lastQR = qr;
        setStatus('qr', 'escaneie o QR code');
      }
      if (connection === 'open') {
        lastQR = '';
        myJid = sock.user && sock.user.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : '';
        setStatus('connected', myJid);
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          setStatus('disconnected', 'dispositivo desconectado');
          sock = null;
        } else {
          setStatus('connecting', 'reconectando…');
          try { await connect(); } catch (_) { /* ignore */ }
        }
      }
    });

    sock.ev.on('messages.upsert', async (evt: any) => {
      try {
        if (evt.type !== 'notify') return;
        for (const m of evt.messages || []) {
          if (!m.message) continue;
          if (m.key.fromMe) continue; // 自己发的，忽略
          const jid = m.key.remoteJid || '';
          if (!jid || jid === 'status@broadcast') continue;
          const text = extractText(m);
          if (!text) continue;
          const pushName = m.pushName || '';
          // Baileys 7 usa LID (@lid) para mensagens; converter para PN (@s.whatsapp.net) se possível
          let pnJid = jid;
          if (jid.endsWith('@lid')) {
            try {
              const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
              if (pn) pnJid = pn;
            } catch (_) { /* ignore — mantém LID */ }
          }
          // 去掉 :device 后缀（Baileys 7 在 PN 后附加 :N）
          const cleanPn = pnJid.replace(/:\d+@/, '@');
          const cleanLid = jid.replace(/:\d+@/, '@');
          console.log('[WhatsApp] 收到消息, jid=' + jid + ' -> pn=' + cleanPn + ', len=' + text.length + ', from=' + pushName);
          try { callbacks.onUserMessage?.(text, cleanPn, pushName, cleanLid); } catch (_) { /* ignore */ }
        }
      } catch (err: any) {
        console.error('[WhatsApp] 处理消息失败:', err && err.message);
      }
    });

    return { success: true };
  } catch (err: any) {
    setStatus('error', err && err.message);
    return { success: false, error: err && err.message };
  }
}

/** 提取消息文本（支持 conversation / extendedText / caption） */
function extractText(m: any): string {
  const msg = m.message || {};
  if (typeof msg.conversation === 'string') return msg.conversation;
  if (msg.extendedTextMessage && typeof msg.extendedTextMessage.text === 'string') return msg.extendedTextMessage.text;
  if (msg.imageMessage && typeof msg.imageMessage.caption === 'string') return msg.imageMessage.caption;
  if (msg.videoMessage && typeof msg.videoMessage.caption === 'string') return msg.videoMessage.caption;
  return '';
}

/** 断开连接。silent=true 时不清状态（用于重连前置） */
async function disconnect(silent?: boolean): Promise<void> {
  const s = sock;
  sock = null;
  if (s) {
    try { await s.end(undefined); } catch (_) { /* ignore */ }
  }
  if (!silent) setStatus('disconnected');
}

/** 发送文本到指定 jid。返回 { success, error } */
async function sendText(text: string, jid: string): Promise<{ success: boolean; error?: string }> {
  if (!sock) return { success: false, error: '未连接' };
  if (!text || !jid) return { success: false, error: '参数为空' };
  try {
    await sock.sendMessage(jid, { text });
    return { success: true };
  } catch (err: any) {
    console.error('[WhatsApp] 发送失败:', err && err.message);
    return { success: false, error: err && err.message };
  }
}

/** 列出最近会话（从 Baileys 的 store；没有 store 时返回空） */
async function listChats(): Promise<{ success: boolean; chats?: WhatsappChat[]; error?: string }> {
  if (!sock) return { success: false, error: '未连接' };
  try {
    // Baileys 默认不内置 store；此处若启用 makeInMemoryStore 才能列出。
    // MVP：返回空列表，UI 让用户直接输 jid 或从收到的消息里绑定。
    return { success: true, chats: [] };
  } catch (err: any) {
    return { success: false, error: err && err.message };
  }
}

/** 是否已连接 */
function isConnected(): boolean {
  return currentStatus === 'connected';
}

export type { WhatsappStatus, WhatsappChat, WhatsappCallbacks };
export { connect, disconnect, sendText, listChats, getStatus, getQR, getQRDataURL, isConnected };
