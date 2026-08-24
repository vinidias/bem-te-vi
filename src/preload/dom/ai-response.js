/**
 * AI 回复完成检测
 * 由原 preload.js 拆分而来，逻辑保持不变。
 */

// ========== AI 回复完成检测 ==========
/**
 * 检测 AI 是否已完成回复
 * 规则：检测最后一条 AI 消息中出现操作按钮组（复制/重新生成等），视为回复结束
 * @returns {boolean} true 表示 AI 已完成回复
 */
const STOP_BTN_SELECTOR =
  '.ds-button.ds-button--primary.ds-button--filled.ds-button--circle.ds-button--m' +
  '.ds-button--icon-relative-m.ds-button--disabled';

const ACTION_BTN_SELECTOR =
  '[role="button"].ds-button--iconLabelTertiary';

function isAIResponseComplete() {
  try {
    // 必须同时满足两个条件才判定为完成：
    // 1. 最后一条 AI 消息出现操作按钮组（复制/重新生成等，≥2 个）
    // 2. 页面存在 disabled 的停止按钮
    let btnCount = 0;
    const hasActionButtons = (() => {
      const messages = document.querySelectorAll('.ds-message');
      if (messages.length === 0) return false;
      const lastMessage = messages[messages.length - 1];
      // 操作按钮组现在位于 .ds-message 的父容器中，不在消息元素内部
      const scope = lastMessage.parentElement || lastMessage;
      const actionButtons = scope.querySelectorAll(ACTION_BTN_SELECTOR);
      btnCount = actionButtons.length;
      return btnCount >= 2;
    })();

    const stopBtn = document.querySelector(STOP_BTN_SELECTOR);
    const hasStopBtn = !!stopBtn;

    if (hasActionButtons && hasStopBtn) {
      console.log('[Cuckoo Code] ✅ 回复已完成（操作按钮组 + disabled 停止按钮同时满足）');
      return true;
    }

    return false;
  } catch (err) {
    console.error('[Cuckoo Code] ❌ 检测 AI 完成状态出错:', err);
    return false;
  }
}

module.exports = { isAIResponseComplete };
