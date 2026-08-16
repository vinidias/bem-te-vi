const { Tool, ToolResult } = require('./ToolRegistry');

/**
 * 网页访问工具
 * 用于访问 http/https 网页，获取响应内容。
 * 第一版仅实现 fetch 模式（Node 内置 fetch），适合 API 和静态网页。
 */
class WebFetchTool extends Tool {
  constructor() {
    super(
      'web_fetch',
      '访问网页或 API。使用 Node 内置 fetch 获取 http/https URL 的响应内容。适合获取网页文本、JSON 数据、API 响应等。注意：不执行 JavaScript，若网页内容由 JS 动态渲染，请使用其他浏览器工具。',
      {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要访问的网址，支持 http/https'
          },
          method: {
            type: 'string',
            description: 'HTTP 方法，默认 GET',
            default: 'GET',
            enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']
          },
          headers: {
            type: 'object',
            description: '请求头，如 { "Authorization": "Bearer xxx" }',
            default: {}
          },
          body: {
            type: 'string',
            description: '请求体（POST/PUT 等使用），字符串'
          },
          timeout: {
            type: 'number',
            description: '超时毫秒，默认 15000',
            default: 15000
          },
          maxSize: {
            type: 'number',
            description: '响应体最大字节数，默认 512000（500KB），超出截断',
            default: 512000
          },
          responseType: {
            type: 'string',
            description: '返回格式: auto (根据 content-type 自动)、json、text',
            default: 'auto',
            enum: ['auto', 'json', 'text']
          }
        },
        required: ['url'],
        additionalProperties: false
      },
      'webFetch(url, options?)'
    );
  }

  /**
   * 执行网页访问
   * @param {Object} params - { url, method?, headers?, body?, timeout?, maxSize?, responseType? }
   * @returns {Promise<ToolResult>}
   */
  async execute(params) {
    const {
      url,
      method = 'GET',
      headers = {},
      body,
      timeout = 15000,
      maxSize = 512000,
      responseType = 'auto'
    } = params;

    if (!url || typeof url !== 'string') {
      return ToolResult.error('url 不能为空');
    }

    // 安全限制：只允许 http/https
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (err) {
      return ToolResult.error('无效的 URL: ' + url);
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return ToolResult.error('仅支持 http/https 协议');
    }

    // 校验超时和 maxSize
    const safeTimeout = typeof timeout === 'number' && timeout > 0 ? Math.min(timeout, 60000) : 15000;
    const safeMaxSize = typeof maxSize === 'number' && maxSize > 0 ? Math.min(maxSize, 5 * 1024 * 1024) : 512000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), safeTimeout);

    const startTime = Date.now();
    try {
      const requestOptions = {
        method: method.toUpperCase(),
        headers: headers || {},
        signal: controller.signal
      };

      if (body !== undefined && body !== null && body !== '') {
        requestOptions.body = String(body);
      }

      const response = await fetch(url, requestOptions);
      clearTimeout(timeoutId);

      // 流式读取响应体，限制大小
      const reader = response.body ? response.body.getReader() : null;
      let receivedBytes = 0;
      let chunks = [];
      let truncated = false;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          receivedBytes += value.byteLength;
          if (receivedBytes > safeMaxSize) {
            const remaining = safeMaxSize - (receivedBytes - value.byteLength);
            if (remaining > 0) {
              chunks.push(value.slice(0, remaining));
            }
            truncated = true;
            break;
          }
          chunks.push(value);
        }
      }

      const buffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
      const rawText = buffer.toString('utf8');

      // 根据 responseType 处理响应内容
      let bodyResult;
      if (responseType === 'json') {
        try {
          bodyResult = JSON.parse(rawText);
        } catch (err) {
          return ToolResult.error('响应不是合法 JSON: ' + err.message);
        }
      } else if (responseType === 'text') {
        bodyResult = rawText;
      } else {
        // auto
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
          try {
            bodyResult = JSON.parse(rawText);
          } catch (err) {
            bodyResult = rawText; // 解析失败，返回原始文本
          }
        } else {
          bodyResult = rawText;
        }
      }

      // 提取响应头
      const responseHeaders = {};
      if (response.headers && response.headers.forEach) {
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });
      }

      const elapsedMs = Date.now() - startTime;

      return ToolResult.success({
        url: response.url || url,
        status: response.status,
        statusText: response.statusText || '',
        headers: responseHeaders,
        body: bodyResult,
        finalUrl: response.url || url,
        truncated,
        elapsedMs
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return ToolResult.error('请求超时 (超过 ' + safeTimeout + 'ms)');
      }
      return ToolResult.error('请求失败: ' + err.message);
    }
  }
}

module.exports = { WebFetchTool };
