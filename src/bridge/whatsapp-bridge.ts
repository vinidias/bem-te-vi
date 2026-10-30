/**
 * WhatsApp 同步：bridge 侧逻辑（运行在 AI 页面 preload）
 *
 * 与 feishu-bridge 同构：
 *   1. 监听"用户消息已发出" → 上报主进程
 *   2. 监听 AI 回复完成 → 上报
 *   3. 监听工具调用（start/end）→ 上报（仅状态）
 *   4. 接收主进程转发的 WhatsApp 来消息 → sendToChat 发给 AI
 *
 * 门控：主进程切换启用状态时通知（enabled=false 时各回调立即返回，零开销）。
 */
import { createRequire } from 'node:module';
import { onInterceptedResponse, onToolCall } from './intercept/observer.js';
import { sendToChat, onUserMessageSent } from '../overlay/chat-input.js';

const require = createRequire(import.meta.url);
const { ipcRenderer } = require('electron');

/** 移除文本中的 cuckoo/js 工具代码块（只保留对话） */
export function stripToolBlocks(text: string): string {
  if (!text) return '';
  let out = text;
  out = out.replace(/\`\`\`(?:cuckoo|javascript|js)\s*\n[\s\S]*?\`\`\`/gi, '');
  out = out.replace(/\`\`\`(?:cuckoo|javascript|js)\s*\n[\s\S]*$/gi, '');
  out = out.replace(/\`\`\`(?:cuckoo|javascript|js)\s*$/gi, '');
  return out.trim();
}

function report(payload: any): void {
  try {
    ipcRenderer.invoke('whatsapp-report', payload).catch(() => {});
  } catch (_) { /* ignore */ }
}

let inited = false;
export function initWhatsappBridge(): void {
  if (inited) return;
  inited = true;

  let enabled = false;
  ipcRenderer.on('whatsapp-mode', (_e: any, payload: any) => {
    enabled = !!(payload && payload.enabled);
  });
  try {
    ipcRenderer.invoke('whatsapp-is-enabled').then((r: any) => {
      if (r) enabled = !!r.enabled;
    }).catch(() => {});
  } catch (_) { /* ignore */ }

  let usedToolThisTurn = false;

  // 1. 用户消息（经 Bem-te-vi 发送）→ 上报
  onUserMessageSent((text: string, tag?: string) => {
    if (!enabled || !text) return;
    usedToolThisTurn = false;
    report({ type: 'user-message', text: text, tag: tag || '' });
  });

  // 2. AI 回复完成 → 上报（剥离工具代码块）
  onInterceptedResponse((text: string) => {
    if (!enabled || !text) return;
    const clean = stripToolBlocks(text);
    if (!clean) return;
    report({ type: 'ai-reply', text: clean });
  });

  // 3. 工具调用状态 → 上报（仅状态）
  onToolCall((ev: any) => {
    if (!enabled || !ev) return;
    usedToolThisTurn = true;
    if (ev.phase === 'start') report({ type: 'tool-start' });
    else if (ev.phase === 'end') report({ type: 'tool-end' });
  });

  // 4. WhatsApp 来消息 → 主进程转发到此 → 发给 AI
  ipcRenderer.on('whatsapp-user-message', (_e: any, payload: any) => {
    const text = payload && payload.text;
    if (!text) return;
    sendToChat(text, 'WhatsApp', 300).catch(() => {});
  });
}
