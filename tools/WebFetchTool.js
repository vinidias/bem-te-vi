const { Tool, ToolResult } = require('./ToolRegistry');
const TurndownService = require('turndown');
const { gfm } = require('@joplin/turndown-plugin-gfm');

// 内部固定上限，不暴露给模型
const FETCH_TIMEOUT_MS = 15000;
const FETCH_MAX_OUTPUT_CHARS = 20000;

/**
 * HTML → Markdown 转换器（对齐 dsh）。
 * - atx 标题、fenced 代码块、- 列表
 * - GFM 插件支持表格/删除线
 * - 移除 script/style/noscript（不保留其文本）
 */
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});
turndown.use(gfm);
turndown.remove(['script', 'style', 'noscript']);

/**
 * 对齐 dsh parseFetchArgs：url trim 非空。
 */
function parseFetchArgs(url) {
  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new Error('url must be a non-empty string');
  }
  return { url };
}

/**
 * 对齐 dsh renderBody：根据 body kind 处理。
 */
function renderBody(kind, content) {
  const sliced = content.slice(0, FETCH_MAX_OUTPUT_CHARS);
  const sourceTruncated = sliced.length !== content.length;
  if (kind === 'html') {
    try {
      return { text: turndown.turndown(sliced), sourceTruncated };
    } catch (e) {
      // 转换失败降级为原始 HTML
      return { text: sliced, sourceTruncated };
    }
  }
  // text
  return { text: sliced, sourceTruncated };
}

/**
 * 对齐 dsh formatFetchOutput：
 * Fetched <url> (HTTP <status>)

<正文>
 * 截断时加 footer。
 */
function formatFetchOutput(url, statusCode, bodyKind, bodyContent, truncated) {
  const rendered = renderBody(bodyKind, bodyContent);
  const effectiveTruncated = truncated || rendered.sourceTruncated || rendered.text.length > FETCH_MAX_OUTPUT_CHARS;
  const header = 'Fetched ' + url + ' (HTTP ' + statusCode + ')\n\n';
  const footer = effectiveTruncated ? '\n\n(Content truncated. Fetch a more specific URL or section for the full text.)' : '';
  let full = header + rendered.text + footer;
  if (full.length > FETCH_MAX_OUTPUT_CHARS) {
    full = full.slice(0, FETCH_MAX_OUTPUT_CHARS) + footer;
  }
  return full;
}

/**
 * web_fetch 工具 - 对齐 dsh。
 * 只接受 url 参数，返回转 Markdown 后的纯文本。
 */
class WebFetchTool extends Tool {
  constructor() {
    super(
      'web_fetch',
      '获取指定 HTTP(S) URL 的内容并解码为文本。HTML 会转换为 Markdown。',
      {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要获取的 HTTP(S) URL'
          }
        },
        required: ['url'],
        additionalProperties: false
      },
      'webFetch(url)'
    );
  }

  async execute(params) {
    const { url } = params;

    try {
      const input = parseFetchArgs(url);

      // 安全限制：只允许 http/https
      const parsedUrl = new URL(input.url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return ToolResult.error('仅支持 http/https 协议');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(input.url, {
          method: 'GET',
          signal: controller.signal,
        });

        // 流式读取，限制大小
        const reader = response.body ? response.body.getReader() : null;
        let receivedBytes = 0;
        const chunks = [];
        let truncated = false;
        const MAX_BYTES = 512000;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            receivedBytes += value.byteLength;
            if (receivedBytes > MAX_BYTES) {
              const remaining = MAX_BYTES - (receivedBytes - value.byteLength);
              if (remaining > 0) chunks.push(value.slice(0, remaining));
              truncated = true;
              try { await reader.cancel(); } catch (_) {}
              break;
            }
            chunks.push(value);
          }
        }

        clearTimeout(timeoutId);

        const buffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
        const rawText = buffer.toString('utf8');

        // 判断 body kind：content-type 含 html 则为 html，否则 text
        const contentType = response.headers.get('content-type') || '';
        const bodyKind = contentType.includes('text/html') || contentType.includes('application/xhtml') ? 'html' : 'text';

        console.log('[WebFetchTool] 抓取完成:', input.url, 'HTTP', response.status, 'kind=' + bodyKind);

        return ToolResult.success(formatFetchOutput(response.url || input.url, response.status, bodyKind, rawText, truncated));
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          return ToolResult.error('请求超时 (超过 ' + FETCH_TIMEOUT_MS + 'ms)');
        }
        return ToolResult.error('请求失败: ' + err.message);
      }
    } catch (err) {
      return ToolResult.error('web_fetch 失败: ' + err.message);
    }
  }
}

module.exports = { WebFetchTool, parseFetchArgs, formatFetchOutput };
