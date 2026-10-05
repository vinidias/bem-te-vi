/**
 * 模型输出速度（tokens per second）估算
 *
 * 背景：服务端只提供 accumulated_token_usage（累计上下文，含 prompt），
 * 不提供单轮输出 token 数。故 TPS 只能用"流式正文长度"估算输出 token：
 *   - CJK 字符（中日韩）约 1 字 = 1 token
 *   - 其余（英文/数字/符号）约 4 字符 = 1 token
 * 这是经验近似，用于"体感展示"，非精确计费口径。
 */

/** 估算一段文本的 token 数（近似） */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/g) || []).length;
  const rest = text.length - cjk;
  return Math.round(cjk + rest / 4);
}

/** 最小计时窗口（秒）：过短会让 TPS 虚高 */
const MIN_WINDOW = 0.3;

/**
 * 测速器：记录一轮生成的首字时间与已输出 token，实时算平均 TPS。
 * 用法：每收到一次流式正文调用 update(text)；新一轮开始前 reset()。
 */
export function createTpsMeter() {
  let startAt = 0;       // 首个正文到达时间（ms）
  let frozen = false;    // 本轮已结束（冻结最终值）
  let value = 0;         // 最近一次算出的 TPS
  let tokens = 0;        // 最近一次的估算输出 token

  return {
    /** 流式正文更新；finished 为 true 时冻结（不再变化）。返回当前 TPS。 */
    update(text: string, finished: boolean, now: number = Date.now()): number {
      if (finished) { frozen = true; return value; }
      if (frozen) { startAt = 0; frozen = false; value = 0; tokens = 0; } // 新一轮
      const t = estimateTokens(text);
      if (t <= 0) return value;
      if (startAt === 0) startAt = now;
      tokens = t;
      const elapsed = (now - startAt) / 1000;
      if (elapsed >= MIN_WINDOW) value = t / elapsed;
      return value;
    },
    /** 新一轮开始：清空状态 */
    reset(): void {
      startAt = 0;
      frozen = false;
      value = 0;
      tokens = 0;
    },
    get value(): number { return value; },
    get tokens(): number { return tokens; },
    get active(): boolean { return startAt !== 0 && !frozen; },
  };
}

/** 把 TPS 格式化为展示文本（无数据返回空串） */
export function formatTps(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return value >= 100 ? String(Math.round(value)) : value.toFixed(1);
}
