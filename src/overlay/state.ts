/**
 * 共享状态（overlay 层）
 * 说明：serverTokenUsage / lastResponseMsgIds 由 bridge 写入、overlay/session 读取，
 * 属跨层共享（P4.2-A 遗留，待改推送机制，见 docs/refactor/P4-input.md 第 8 条）。
 */
interface PreloadState {
  initialPromptContent: string;
  // 是否有待发送的初始提示
  pendingInitialPrompt: boolean;
  // 发送延迟配置（毫秒）
  sendDelayMin: number;
  sendDelayMax: number;
  // 当前项目目录（null 表示未初始化）
  currentProjectDir: string | null;
  // 服务端返回的权威 token 统计（{ accumulatedTokens, insertedAt, updatedAt, modelType }）
  serverTokenUsage: any;
  // 最近一次 AI 回复的消息 id（{ requestMessageId, responseMessageId }）
  lastResponseMsgIds: any;
}

const state: PreloadState = {
  initialPromptContent: '',
  // 是否有待发送的初始提示
  pendingInitialPrompt: false,
  // 发送延迟配置（毫秒）
  sendDelayMin: 2000,
  sendDelayMax: 4000,
  // 当前项目目录（null 表示未初始化）
  currentProjectDir: null,
  // 服务端返回的权威 token 统计（{ accumulatedTokens, insertedAt, updatedAt, modelType }）
  serverTokenUsage: null,
  // 最近一次 AI 回复的消息 id（{ requestMessageId, responseMessageId }）
  lastResponseMsgIds: null,
};

export { state };
export type { PreloadState };
