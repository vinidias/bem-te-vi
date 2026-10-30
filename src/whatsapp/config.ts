/**
 * WhatsApp 同步：配置读写（用户级 ~/.cuckoo/whatsapp.json）
 *
 * 存储：{ enabled, pushUserMessage, pushAiReply, pushToolStatus, pushToolName }
 * 凭据由 Baileys 管理（~/.cuckoo/whatsapp-auth/ 多文件）。
 * 可用环境变量 CUCKOO_HOME 覆盖（测试隔离）。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface WhatsappConfig {
  /** 是否启用 WhatsApp 同步 */
  enabled: boolean;
  /** 推送：用户消息（经 Bem-te-vi 发送的） */
  pushUserMessage: boolean;
  /** 推送：AI 文本回复 */
  pushAiReply: boolean;
  /** 推送：工具调用状态（仅"调用中/完成"） */
  pushToolStatus: boolean;
  /** 工具状态里是否带工具名（默认 false，保护隐私） */
  pushToolName: boolean;
}

function getUserDir(): string {
  const override = process.env.CUCKOO_HOME;
  return override ? override : path.join(os.homedir(), '.cuckoo');
}

function getConfigFile(): string {
  return path.join(getUserDir(), 'whatsapp.json');
}

/** 凭据目录（Baileys multi-file auth） */
function getAuthDir(): string {
  return path.join(getUserDir(), 'whatsapp-auth');
}

/** 默认配置（未启用） */
function defaultConfig(): WhatsappConfig {
  return {
    enabled: false,
    pushUserMessage: true,
    pushAiReply: true,
    pushToolStatus: true,
    pushToolName: false,
  };
}

/** 读取配置（不存在则返回默认；字段类型清洗） */
function readConfig(): WhatsappConfig {
  const dft = defaultConfig();
  try {
    const file = getConfigFile();
    if (!fs.existsSync(file)) return dft;
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!raw || typeof raw !== 'object') return dft;
    return {
      enabled: raw.enabled === true,
      pushUserMessage: raw.pushUserMessage !== false,
      pushAiReply: raw.pushAiReply !== false,
      pushToolStatus: raw.pushToolStatus !== false,
      pushToolName: raw.pushToolName === true,
    };
  } catch (err: any) {
    console.error('[WhatsApp] 读取配置失败:', err.message);
    return dft;
  }
}

/** 写入配置（整体覆盖） */
function writeConfig(data: any): boolean {
  try {
    const base = readConfig();
    const next: WhatsappConfig = {
      enabled: data && data.enabled !== undefined ? data.enabled === true : base.enabled,
      pushUserMessage: data && data.pushUserMessage !== undefined ? data.pushUserMessage !== false : base.pushUserMessage,
      pushAiReply: data && data.pushAiReply !== undefined ? data.pushAiReply !== false : base.pushAiReply,
      pushToolStatus: data && data.pushToolStatus !== undefined ? data.pushToolStatus !== false : base.pushToolStatus,
      pushToolName: data && data.pushToolName !== undefined ? data.pushToolName === true : base.pushToolName,
    };
    const dir = getUserDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getConfigFile(), JSON.stringify(next, null, 2), 'utf-8');
    console.log('[WhatsApp] 配置已写入:', getConfigFile());
    return true;
  } catch (err: any) {
    console.error('[WhatsApp] 写入配置失败:', err.message);
    return false;
  }
}

export { readConfig, writeConfig, defaultConfig, getConfigFile, getAuthDir, getUserDir };
