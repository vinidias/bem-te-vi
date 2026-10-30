/**
 * WhatsApp 工作区绑定：每个 profile（窗口）可绑定多个 jid（联系人/群）。
 *
 * 存储：profile.whatsappJids = [{ jid, name, type: 'contact'|'group', active }]
 * active 标记回复目标（同一时刻只有一个 active）。
 *
 * 本模块只读写 profile 字段，不依赖 whatsapp/service，避免循环依赖。
 */
import { readProfiles, writeProfiles } from './profile.js';

interface WhatsappBinding {
  jid: string;
  name: string;
  type: 'contact' | 'group';
  active: boolean;
}

interface WorkspaceInfo {
  profileId: string;
  windowId: number | null;
  bindings: WhatsappBinding[];
}

/** 判断 jid 是否群 */
function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}

/** 规范化 jid：去掉 :device 后缀（Baileys 7 在 PN 后附加 :N） */
function normalizeJid(jid: string): string {
  if (!jid) return '';
  return jid.replace(/:\d+@/, '@');
}

/** 读取某 profile 的绑定（不存在返回 []） */
function getBindings(profileId: string): WhatsappBinding[] {
  const profiles = readProfiles();
  const p = profiles.find((x: any) => x.id === profileId);
  if (!p || !Array.isArray(p.whatsappJids)) return [];
  return p.whatsappJids.map((b: any) => ({
    jid: String(b.jid || ''),
    name: String(b.name || ''),
    type: b.type === 'group' ? 'group' : 'contact',
    active: b.active === true,
  })).filter((b: WhatsappBinding) => b.jid);
}

/** 写入某 profile 的绑定（整体覆盖） */
function setBindings(profileId: string, bindings: WhatsappBinding[]): boolean {
  const profiles = readProfiles();
  const idx = profiles.findIndex((x: any) => x.id === profileId);
  if (idx < 0) return false;
  // 只允许一个 active
  let hasActive = false;
  const clean = bindings.map((b) => {
    const active = b.active === true && !hasActive;
    if (active) hasActive = true;
    return {
      jid: String(b.jid || ''),
      name: String(b.name || ''),
      type: b.type === 'group' ? 'group' : 'contact',
      active,
    };
  }).filter((b) => b.jid);
  profiles[idx].whatsappJids = clean;
  writeProfiles(profiles);
  return true;
}

/** 添加单个绑定（去重）；active=true 时取消其他 active */
function addBinding(profileId: string, binding: WhatsappBinding): boolean {
  const cur = getBindings(profileId);
  const existing = cur.findIndex((b) => b.jid === binding.jid);
  if (existing >= 0) {
    cur[existing] = { ...binding, type: isGroupJid(binding.jid) ? 'group' : binding.type };
  } else {
    cur.push({ ...binding, type: isGroupJid(binding.jid) ? 'group' : binding.type });
  }
  if (binding.active) {
    for (const b of cur) b.active = b.jid === binding.jid;
  } else if (!cur.some((b) => b.active)) {
    // 第一个绑定自动 active
    cur[cur.length - 1].active = true;
  }
  return setBindings(profileId, cur);
}

/** 移除绑定；若移除的是 active，则把第一个标记为 active */
function removeBinding(profileId: string, jid: string): boolean {
  const cur = getBindings(profileId).filter((b) => b.jid !== jid);
  if (cur.length > 0 && !cur.some((b) => b.active)) cur[0].active = true;
  return setBindings(profileId, cur);
}

/** 设 active jid */
function setActive(profileId: string, jid: string): boolean {
  const cur = getBindings(profileId);
  if (!cur.some((b) => b.jid === jid)) return false;
  for (const b of cur) b.active = b.jid === jid;
  return setBindings(profileId, cur);
}

/** 找哪个 profile 绑定了该 jid（返回第一个匹配） */
function findProfileByJid(jid: string): string | null {
  const target = normalizeJid(jid);
  if (!target) return null;
  const profiles = readProfiles();
  for (const p of profiles) {
    if (!Array.isArray(p.whatsappJids)) continue;
    if (p.whatsappJids.some((b: any) => normalizeJid(b.jid) === target)) return p.id;
  }
  return null;
}

/** 列出所有 workspace（调试用） */
function listWorkspaces(): WorkspaceInfo[] {
  const profiles = readProfiles();
  const out: WorkspaceInfo[] = [];
  for (const p of profiles) {
    if (!Array.isArray(p.whatsappJids) || p.whatsappJids.length === 0) continue;
    out.push({
      profileId: p.id,
      windowId: p.windowId || null,
      bindings: getBindings(p.id),
    });
  }
  return out;
}

export type { WhatsappBinding, WorkspaceInfo };
export { getBindings, setBindings, addBinding, removeBinding, setActive, findProfileByJid, listWorkspaces, isGroupJid, normalizeJid };
