/**
 * JS 工具脚本检测与代码块提取
 * 由原 preload.js 拆分而来，逻辑保持不变。
 */
const { getCodeBlockLanguage } = require('./detector');

// ========== JS 工具脚本检测与执行 ==========

// 反引号与围栏（用字符码构造，避免源码中的转义问题）
const BT = String.fromCharCode(96);
const FENCE = BT + BT + BT;
// 工具调用特征：必须出现 "await 工具函数名(" 形式的调用（防止 fs.readFile 等普通示例误判）
const JS_TOOL_CALL_RE = /\bawait\s+(?:readFile|readFileWithLines|writeFile|editFile|glob|grep|bash|deleteFile|webFetch)\s*\(/;
/**
 * 判断一段 JS 代码是否调用了工具函数
 */
function looksLikeIncompleteCodeError(error) {
  if (!error || typeof error !== 'string') return false;
  return /SyntaxError|Missing initializer|Unexpected end of input|Unexpected token|Unexpected identifier|Unexpected reserved word|Invalid or unexpected token/i.test(error);
}

function looksLikeToolScript(code) {
  const c = code || '';
  return JS_TOOL_CALL_RE.test(c);
}

/**
 * 判断原始文本去掉所有围栏代码块后是否只剩空白（整条回复只包含代码块）
 */
function hasOnlyFences(text) {
  if (!text || typeof text !== 'string') return false;
  const lines = text.split(String.fromCharCode(10));
  const rest = [];
  let inFence = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith(FENCE)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) rest.push(t);
  }
  return rest.join(' ').trim() === '';
}

/**
 * 从原始文本（含 Markdown 围栏）中提取 JS 工具代码块
 * 规则：
 * - cuckoo 代码块：一律视为工具脚本
 * - js / javascript 代码块：仅当整条回复只包含代码块、且代码调用了工具函数时才视为工具脚本
 *   （避免把正常回答里的示例代码误当作工具脚本执行）
 */
function extractJsToolBlocks(text) {
  const blocks = [];
  if (!text || typeof text !== 'string') return blocks;

  const onlyFences = hasOnlyFences(text);

  const lines = text.split(String.fromCharCode(10));
  let inBlock = false;
  let lang = '';
  let buf = [];

  const flush = () => {
    const code = buf.join(String.fromCharCode(10)).trim();
    const l = (lang || '').toLowerCase();
    if (code) {
      if (l === 'cuckoo') {
        blocks.push(code);
      } else if ((l === 'js' || l === 'javascript') && onlyFences && looksLikeToolScript(code)) {
        blocks.push(code);
      }
    }
    inBlock = false;
    lang = '';
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!inBlock) {
      if (trimmed.startsWith(FENCE)) {
        lang = (trimmed.slice(3) || '').split(' ')[0];
        inBlock = true;
        buf = [];
      }
      continue;
    }
    if (trimmed.startsWith(FENCE)) {
      flush();
      continue;
    }
    buf.push(line.replace(String.fromCharCode(13), ''));
  }
  if (inBlock) flush();
  return blocks;
}

/**
 * 判断容器去掉所有 pre 代码块后是否只剩空白（整条回复只包含代码块）
 */
function hasOnlyCodeContent(root) {
  if (!root) return false;
  // 调用方已定位到具体代码块元素时，视为"只有代码"
  if (root.tagName === 'PRE') return true;
  const clone = root.cloneNode(true);
  // 剔除代码块本身、banner（语言标签 + 复制/下载按钮）与工具栏等装饰元素
  clone.querySelectorAll('pre, .md-code-block-banner-wrap, .md-code-block-banner, button, [class*="toolbar"], [class*="copy"], [class*="download"], [class*="code-block-header"], [class*="lang"], [class*="header"]').forEach((el) => el.remove());
  return !(clone.textContent || '').trim();
}

/**
 * 从渲染后的 DOM（markdown 容器或单个 pre 元素）中提取 JS 工具代码块
 * 规则同 extractJsToolBlocks：js/javascript 块要求整条回复只包含代码块
 */
function getJsCodeBlocksFromMarkdown(root) {
  const blocks = [];
  if (!root) return blocks;

  const onlyCode = hasOnlyCodeContent(root);

  const pres = [];
  if (root.tagName === 'PRE') pres.push(root);
  if (root.querySelectorAll) {
    const nested = root.querySelectorAll('pre');
    for (const p of nested) pres.push(p);
  }

  for (const pre of pres) {
    const lang = getCodeBlockLanguage(pre);
    const codeEl = pre.querySelector('code');
    const code = ((codeEl ? codeEl.textContent : pre.textContent) || '').trim();
    if (!code) continue;
    if (lang === 'cuckoo') {
      blocks.push(code);
      continue;
    }
    if ((lang === 'js' || lang === 'javascript' || lang === '') && onlyCode && looksLikeToolScript(code)) {
      blocks.push(code);
    }
  }
  return blocks;
}

module.exports = {
  BT,
  FENCE,
  JS_TOOL_CALL_RE,
  looksLikeIncompleteCodeError,
  looksLikeToolScript,
  hasOnlyFences,
  extractJsToolBlocks,
  hasOnlyCodeContent,
  getJsCodeBlocksFromMarkdown,
};
