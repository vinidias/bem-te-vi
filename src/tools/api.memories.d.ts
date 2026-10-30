/**
 * Cuckoo Code 工具 API —— 功能分组声明（按需注入）
 *
 * 本文件仅在对应功能启用时，追加到基础契约（api.d.ts）之后。
 * 基础类型（projectDir / log 等）见 api.d.ts，本文件不重复声明。
 *
 * ⚠️ 本文件由 scripts/build-tool-api.mjs 自动生成，请勿手动编辑。
 */


// ================= 记忆 =================

/**
 * 把用户明确表达的偏好、习惯或长期有用的事实记入长期记忆（跨会话、跨项目保留）。后续对话会自动注入这些记忆。
 * @param text 要记住的内容（一句话，如"用户偏好用中文回复"）
 * @returns { id: string, message: string }
 * @throws 缺少窗口上下文或内容为空时抛出异常
 */
declare function remember(text: string): Promise<{ id: string, message: string }>;

/**
 * 按 id 删除一条长期记忆（当用户要求"忘掉"某事，或记忆已过时）。可用 listMemories 查看现有记忆及其 id。
 * @param id 要删除的记忆 id
 * @returns 确认消息
 * @throws id 为空或记忆不存在时抛出异常
 */
declare function forgetMemory(id: string): Promise<string>;
