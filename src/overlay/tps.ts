/**
 * 模型输出速度（tokens per second）
 *
 * 两条路径：
 *  1) 精确路径：DeepSeek 每帧下发 accumulated_token_usage（= prompt + 已生成输出），
 *     本轮输出 token = 当前值 − 本轮起始值，TpsMeter 优先采用。
 *  2) 回退估算：ChatGPT/Claude hook 未提供 token 用量，用正文长度近似估算。
 *     - CJK 约 0.7 token/字（DeepSeek BPE 常合并双字词）
 *     - 英文/符号约 0.28 token/字符（约 3.5 字符/token）
 *     - 数字约 0.35/位，空白约 0.25/字符，emoji 约 2.5/个
 *     仅用于体感展示，非计费口径。
 */

/** 估算一段文本的 token 数（近似；仅在无服务端 token 时回退使用） */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/g) || []).length;
  const emoji = (text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
  const digits = (text.match(/\d/g) || []).length;
  const spaces = (text.match(/\s/g) || []).length;
  const rest = Math.max(0, text.length - cjk - emoji - digits - spaces);
  return Math.round(cjk * 0.7 + emoji * 2.5 + digits * 0.35 + spaces * 0.25 + rest * 0.28);
}

/** 最小计时窗口（秒）：过短会让 TPS 虚高 */
const MIN_WINDOW = 0.3;

/**
 * 测速器：记录一轮生成的首字时间与已输出 token，实时算平均 TPS。
 * 用法：每收到一次流式正文调用 update(text, finished, acc)；新一轮开始前 reset()。
 * acc 为服务端 accumulated_token_usage（无则传 null，回退到估算）。
 */
export function createTpsMeter() {
  let startAt = 0;        // 本轮起始时间（ms）
  let baseAcc = 0;        // 本轮起始 accumulated（用于差值）
  let lastAcc = 0;        // 最新 accumulated
  let hasAcc = false;     // 本轮是否已收到服务端 token
  let frozen = false;     // 本轮已结束（冻结最终值）
  let running = false;    // 本轮生成进行中
  let value = 0;          // 最近一次算出的 TPS
  let tokens = 0;         // 最近一次的本轮输出 token（精确或估算）

  function clearRound() {
    startAt = 0; baseAcc = 0; lastAcc = 0; hasAcc = false;
    frozen = false; running = false; value = 0; tokens = 0;
  }

  return {
    /**
     * 流式更新。finished 为 true 时冻结最终值。
     * acc 为服务端 accumulated_token_usage；优先用其差值算精确 TPS，否则回退估算。
     */
    update(text: string, finished: boolean, acc: number | null = null, now: number = Date.now()): number {
      if (finished) { frozen = true; running = false; return value; }
      if (frozen) clearRound(); // 新一轮
      running = true;

      // 精确路径：服务端 token 差值
      if (typeof acc === 'number' && acc >= 0) {
        if (!hasAcc) { baseAcc = acc; hasAcc = true; startAt = now; }
        lastAcc = acc;
        tokens = Math.max(0, lastAcc - baseAcc);
        const elapsed = (now - startAt) / 1000;
        if (elapsed >= MIN_WINDOW && tokens > 0) value = tokens / elapsed;
        return value;
      }

      // 回退路径：正文长度估算
      const t = estimateTokens(text);
      if (t <= 0) return value;
      if (startAt === 0) startAt = now;
      tokens = t;
      const elapsed = (now - startAt) / 1000;
      if (elapsed >= MIN_WINDOW) value = t / elapsed;
      return value;
    },
    /** 新一轮开始：清空状态 */
    reset(): void { clearRound(); },
    get value(): number { return value; },
    get tokens(): number { return tokens; },
    /** 是否正在本轮生成计时中（不含已结束） */
    get active(): boolean { return running && !frozen; },
  };
}

/** 把 TPS 格式化为展示文本（无数据返回空串） */
export function formatTps(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return value >= 100 ? String(Math.round(value)) : value.toFixed(1);
}
