/**
 * preload 全局共享状态
 * 由原 preload.js 中的模块级变量拆分而来，各模块通过同一对象共享。
 */
const state = {
  initialPromptContent: '',
  // 是否有待发送的初始提示
  pendingInitialPrompt: false,
  // 待执行的工具调用
  pendingToolCall: null,
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
