/**
 * preload 全局共享状态
 * 由原 preload.js 中的模块级变量拆分而来，各模块通过同一对象共享。
 */
module.exports = {
  systemPromptContent: '',
  initialPromptContent: '',
  // 是否有待发送的 system prompt
  pendingSystemPrompt: false,
  // 是否有待发送的初始提示（目录树+systemPrompt）
  pendingInitialPrompt: false,
  // 待执行的工具调用
  pendingToolCall: null,
  // 发送延迟配置（毫秒）
  sendDelayMin: 2000,
  sendDelayMax: 4000,
};
