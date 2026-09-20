/**
 * DeepSeek 网络拦截器（注入 AI 网页主世界执行）
 *
 * 构建期经 esbuild 打包为自包含 IIFE（见 scripts/build-hooks.mjs），
 * 运行时仍是单个字符串，故可自由 import 共享模块（打包时内联）。
 * 共享 SSE 解码见 ./shared/sse.js。
 */
import { createFrameDecoder, parseBlock } from './shared/sse.js';

function install(): void {
  var MARKER = '__cuckooDeepseekHookInstalled__';
  if (window[MARKER]) return;
  window[MARKER] = true;

  var COMPLETION_PATH = '/api/v0/chat/completion';
  var STOP_STREAM_PATH = '/api/v0/chat/stop_stream';
  // 用户主动停止标志：拦截到 stop_stream 请求时置位，新的 completion 开始时复位
  var userStopped = false;

  function isStopStream(url, method) {
    if (!url) return false;
    if (String(method || 'GET').toUpperCase() !== 'POST') return false;
    try {
      var u = new URL(url, document.baseURI);
      return u.pathname === STOP_STREAM_PATH;
    } catch (e) {
      return String(url).indexOf(STOP_STREAM_PATH) !== -1;
    }
  }

  function isCompletion(url, method) {
    if (!url) return false;
    if (String(method || 'GET').toUpperCase() !== 'POST') return false;
    try {
      var u = new URL(url, document.baseURI);
      return u.pathname === COMPLETION_PATH;
    } catch (e) {
      return String(url).indexOf(COMPLETION_PATH) !== -1;
    }
  }

  // 从当前 URL 提取会话 ID（用于错误事件的会话校验）
  function getSessionIdFromUrl() {
    try {
      var m = String(location.href).match(/\/chat\/s\/([a-f0-9-]+)/i);
      return m ? m[1] : null;
    } catch (e) { return null; }
  }

  // 终态判定：'finished' 正常完成 / 'stopped' 用户停止 / 'error' 失败
  // 用户停止信号：SSE INCOMPLETE 或 拦截到 stop_stream 请求（更可靠，二者取或）
  function resolveStatus(extractor) {
    var st = 'error';
    if (extractor.finished) st = 'finished';
    else if (extractor.incomplete || userStopped) st = 'stopped';
    console.log('[Cuckoo Code][hook] resolveStatus => ' + st + ' (finished=' + extractor.finished + ', incomplete=' + extractor.incomplete + ', userStopped=' + userStopped + ')');
    return st;
  }

  function dispatch(text, status, tokenUsage, msgIds, extra?) {
    try {
      if (status === 'error') {
        var detail = { text: text || '', status: 'error', tokenUsage: tokenUsage || null, msgIds: msgIds || null };
        if (extra) {
          for (var k in extra) {
            if (Object.prototype.hasOwnProperty.call(extra, k)) detail[k] = extra[k];
          }
        }
        window.dispatchEvent(new CustomEvent('cuckoo-ai-error', { detail: detail }));
      } else {
        window.dispatchEvent(new CustomEvent('cuckoo-ai-response', {
          detail: { text: text || '', finished: status === 'finished', status: status, tokenUsage: tokenUsage || null, msgIds: msgIds || null }
        }));
      }
    } catch (e) { /* ignore */ }
  }

  // ---------- 回复文本提取（区分 THINK / RESPONSE 片段）----------
  function createExtractor() {
    var fragmentTypes = [];
    var currentIndex = -1;
    var observed = false;
    var text = '';
    var finished = false;
    // 用户主动停止：服务端下发 response/status = INCOMPLETE
    var incomplete = false;
    // 服务端权威 token 统计（accumulated_token_usage 含 prompt/context + 输出）
    var tokenUsage = null;
    // 本条回复的消息 id：requestMessageId（用户提问）+ responseMessageId（AI 回复）
    var msgIds = null;

    // 从对象里捕获消息 id 字段
    function captureMsgIds(src) {
      if (!src || typeof src !== 'object') return;
      if (!msgIds) msgIds = {};
      if (typeof src.request_message_id === 'number') msgIds.requestMessageId = src.request_message_id;
      if (typeof src.response_message_id === 'number') msgIds.responseMessageId = src.response_message_id;
      // 快照形式：{v:{response:{message_id, parent_id}}}
      if (typeof src.message_id === 'number') msgIds.responseMessageId = src.message_id;
      if (typeof src.parent_id === 'number') msgIds.requestMessageId = src.parent_id;
    }

    // 从对象里捕获 token 相关字段（幂等，只保留最后一次值）
    function captureTokenUsage(src) {
      if (!src || typeof src !== 'object') return;
      var changed = false;
      if (!tokenUsage) tokenUsage = {};
      if (typeof src.accumulated_token_usage === 'number') {
        tokenUsage.accumulatedTokens = src.accumulated_token_usage; changed = true;
      }
      if (typeof src.inserted_at === 'number') {
        tokenUsage.insertedAt = src.inserted_at; changed = true;
      }
      if (typeof src.updated_at === 'number') {
        tokenUsage.updatedAt = src.updated_at; changed = true;
      }
      if (typeof src.model_type === 'string') {
        tokenUsage.modelType = src.model_type; changed = true;
      }
      if (!changed && Object.keys(tokenUsage).length === 0) tokenUsage = null;
    }

    function lastSeg(p) { return typeof p === 'string' ? p.split('/').pop() : ''; }
    function isTextPatch(p) {
      var s = lastSeg(p);
      return s === 'content' || s === 'text' || s === 'markdown' || s === 'delta';
    }
    function isResponsePatch(p) {
      return typeof p === 'string' && (p === 'response' || p.indexOf('response/') === 0);
    }
    function isResponseTextPatch(p) { return isTextPatch(p) && isResponsePatch(p); }
    function isThinkingPatch(p) {
      var s = lastSeg(p);
      return s === 'reasoning_content' || s === 'thinking_content';
    }
    function isFragmentsAppend(p) {
      return p && typeof p.p === 'string' && p.p.slice(-10) === '/fragments' &&
        p.o === 'APPEND' && Array.isArray(p.v);
    }
    function snapshotFragments(p) {
      if (!p || p.p !== undefined || !p.v || typeof p.v !== 'object') return null;
      var r = p.v.response;
      if (!r || typeof r !== 'object') return null;
      var f = r.fragments;
      return Array.isArray(f) && f.length > 0 ? f : null;
    }
    function fragText(f) {
      if (!f || typeof f !== 'object') return '';
      if (typeof f.content === 'string') return f.content;
      if (typeof f.text === 'string') return f.text;
      return '';
    }
    function typeAt(i) {
      if (i === -1) i = currentIndex;
      if (i < 0 || i >= fragmentTypes.length) return null;
      return fragmentTypes[i];
    }
    function isThink(t) { return String(t).toUpperCase() === 'THINK'; }
    function consumeFragmentContent(fragments, types) {
      for (var i = 0; i < fragments.length; i++) {
        var c = fragText(fragments[i]);
        if (!c) continue;
        if (!isThink(types[i])) text += c;
      }
    }

    function consume(parsed) {
      if (!parsed || typeof parsed !== 'object') return;
      if (parsed.o === 'BATCH' && Array.isArray(parsed.v)) {
        for (var i = 0; i < parsed.v.length; i++) consume(parsed.v[i]);
        return;
      }
      // ---- 消息 id 捕获 ----
      // 顶层帧：{"request_message_id":668,"response_message_id":669,...}
      captureMsgIds(parsed);
      // ---- token 字段捕获 ----
      // 1) 消息快照：{"v":{"response":{"accumulated_token_usage":...}}}
      if (parsed.v && typeof parsed.v === 'object' && parsed.v.response && typeof parsed.v.response === 'object') {
        captureTokenUsage(parsed.v.response);
        captureMsgIds(parsed.v.response);
      }
      // 2) 独立帧：{"p":"accumulated_token_usage","v":123}
      if (typeof parsed.p === 'string' && lastSeg(parsed.p) === 'accumulated_token_usage' && typeof parsed.v === 'number') {
        captureTokenUsage({ accumulated_token_usage: parsed.v });
      }
      // 3) 顶层 updated_at：{"updated_at":1789351765.04}
      if (parsed.updated_at !== undefined) {
        captureTokenUsage(parsed);
      }
      if (isFragmentsAppend(parsed)) {
        var types = [];
        for (var j = 0; j < parsed.v.length; j++) {
          types.push(String((parsed.v[j] && parsed.v[j].type) || 'RESPONSE'));
        }
        fragmentTypes = fragmentTypes.concat(types);
        currentIndex = fragmentTypes.length - 1;
        observed = true;
        consumeFragmentContent(parsed.v, types);
        return;
      }
      var snap = snapshotFragments(parsed);
      if (snap) {
        var first = !observed;
        var stypes = [];
        for (var k = 0; k < snap.length; k++) {
          stypes.push(String((snap[k] && snap[k].type) || 'RESPONSE'));
        }
        fragmentTypes = stypes;
        currentIndex = fragmentTypes.length - 1;
        observed = true;
        if (first) consumeFragmentContent(snap, stypes);
        return;
      }
      if (isThinkingPatch(parsed.p) && typeof parsed.v === 'string') return;
      if (typeof parsed.p === 'string' && isResponseTextPatch(parsed.p) && typeof parsed.v === 'string') {
        var m = /^response\/fragments\/(-?\d+)\//.exec(parsed.p);
        var idx = m ? Number(m[1]) : -1;
        if (!isThink(typeAt(idx))) text += parsed.v;
        return;
      }
      if (parsed.p === undefined && typeof parsed.v === 'string') {
        if (!isThink(typeAt(currentIndex))) text += parsed.v;
        return;
      }
      if (parsed.p === 'response/status' || parsed.p === 'quasi_status') {
        if (parsed.v === 'FINISHED') finished = true;
        else if (parsed.v === 'INCOMPLETE') incomplete = true;
      }
    }

    return {
      consume: consume,
      get text() { return text; },
      get finished() { return finished; },
      get incomplete() { return incomplete; },
      get tokenUsage() { return tokenUsage; },
      get msgIds() { return msgIds; }
    };
  }

  function observeBody(body) {
    if (!body) return;
    var reader = body.getReader();
    var decoder = new TextDecoder();
    var frameDecoder = createFrameDecoder();
    var extractor = createExtractor();
    var dispatched = false;

    function feed(chunk) {
      var frames = frameDecoder.push(chunk);
      for (var i = 0; i < frames.length; i++) {
        var parsed = parseBlock(frames[i]);
        if (parsed) extractor.consume(parsed);
      }
      if (extractor.finished && !dispatched) {
        dispatched = true;
        dispatch(extractor.text, 'finished', extractor.tokenUsage, extractor.msgIds);
      }
    }

    function pump() {
      reader.read().then(function (r) {
        if (r.done) {
          var tail = decoder.decode();
          if (tail) feed(tail);
          var rest = frameDecoder.finish();
          for (var i = 0; i < rest.length; i++) {
            var parsed = parseBlock(rest[i]);
            if (parsed) extractor.consume(parsed);
          }
          if (!dispatched) {
            dispatched = true;
            dispatch(extractor.text, resolveStatus(extractor), extractor.tokenUsage, extractor.msgIds);
          }
          return;
        }
        feed(decoder.decode(r.value, { stream: true }));
        pump();
      }).catch(function (e) {
        if (!dispatched) {
          dispatched = true;
          console.log('[Cuckoo Code][hook] fetch stream error name=' + (e && e.name));
          dispatch(extractor.text, 'error', extractor.tokenUsage, extractor.msgIds, { reason: 'stream', name: e && e.name, sessionId: getSessionIdFromUrl() });
        }
      });
    }
    pump();
  }

  // ---------- 缓存真实请求头（供压缩时直接 fetch 使用）----------
  // DeepSeek 的 share/create 需要 authorization + x-client-* 头，
  // 拦截任意请求时缓存最新一组，供后续直接调用 API。
  function cacheHeaders(hdrs) {
    try {
      if (!hdrs) return;
      var lower = {};
      for (var k in hdrs) {
        if (Object.prototype.hasOwnProperty.call(hdrs, k)) {
          lower[String(k).toLowerCase()] = hdrs[k];
        }
      }
      if (!lower['authorization']) return;
      localStorage.setItem('cuckoo-ds-headers', JSON.stringify(lower));
    } catch (e) { /* ignore */ }
  }

  // ---------- fetch 拦截 ----------
  var origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input: any, init: any) {
      var url = typeof input === 'string' ? input
        : (input && input.url) ? input.url
        : (input && input.href) ? input.href : '';
      var method = (init && init.method) || (input && input.method) || 'GET';
      // 缓存请求头
      try {
        if (init && init.headers) {
          var h = init.headers;
          var obj = {};
          if (typeof h.forEach === 'function' && !Array.isArray(h)) { h.forEach(function (v, k) { obj[k] = v; }); }
          else if (Array.isArray(h)) { h.forEach(function (p) { obj[p[0]] = p[1]; }); }
          else { obj = h; }
          cacheHeaders(obj);
        }
      } catch (e) { /* ignore */ }
      var p = origFetch.apply(this, arguments);
      if (isStopStream(url, method)) {
        userStopped = true;
        console.log('[Cuckoo Code][hook] 检测到 stop_stream(fetch)，标记用户停止');
        return p;
      }
      if (!isCompletion(url, method)) return p;
      userStopped = false; // 新的 completion 开始：复位用户停止标志
      var fetchSessionId = getSessionIdFromUrl(); // 发起时记录会话
      return p.then(function (response) {
        try {
          if (response && response.ok === false) {
            dispatch('', 'error', null, null, { reason: 'http', httpStatus: response.status, sessionId: fetchSessionId });
          } else if (response && response.body) {
            observeBody(response.clone().body);
          }
        } catch (e) { /* ignore */ }
        return response;
      }, function (err) {
        console.log('[Cuckoo Code][hook] fetch completion reject name=' + (err && err.name));
        dispatch('', 'error', null, null, { reason: 'network', name: err && err.name, sessionId: fetchSessionId });
        throw err;
      });
    };
  }

  // ---------- XHR 拦截（被动读取 responseText）----------
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  var origSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  var xhrInfo = new WeakMap();
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    try {
      var inf = xhrInfo.get(this) || {};
      if (!inf.headers) inf.headers = {};
      inf.headers[name] = value;
      xhrInfo.set(this, inf);
      cacheHeaders(inf.headers);
    } catch (e) { /* ignore */ }
    return origSetRequestHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.open = function (method, url) {
    try { xhrInfo.set(this, { url: url, method: method }); } catch (e) { /* ignore */ }
    // 拦截 stop_stream：用户主动停止的直接证据
    try {
      if (isStopStream(url, method)) {
        userStopped = true;
        console.log('[Cuckoo Code][hook] 检测到 stop_stream，标记用户停止');
      }
    } catch (e) { /* ignore */ }
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    var info = xhrInfo.get(this);
    if (info && isCompletion(info.url, info.method)) {
      // 新的 completion 开始：复位用户停止标志
      userStopped = false;
      try { observeXhr(this); } catch (e) { console.error('[Cuckoo Code][hook] observeXhr 异常: ' + e.message); }
    }
    return origSend.apply(this, arguments);
  };


  function observeXhr(xhr) {
    var lastLen = 0;
    var frameDecoder = createFrameDecoder();
    var extractor = createExtractor();
    var dispatched = false;
    var reqSessionId = getSessionIdFromUrl(); // 发起时记录会话

    function consumeChunk() {
      var raw;
      try { raw = xhr.responseText; } catch (e) { return; }
      if (typeof raw !== 'string' || raw.length <= lastLen) return;
      var chunk = raw.slice(lastLen);
      lastLen = raw.length;
      var frames = frameDecoder.push(chunk);
      for (var i = 0; i < frames.length; i++) {
        var parsed = parseBlock(frames[i]);
        if (parsed) extractor.consume(parsed);
      }
      if (extractor.finished && !dispatched) {
        dispatched = true;
        dispatch(extractor.text, 'finished', extractor.tokenUsage, extractor.msgIds);
      }
    }

    xhr.addEventListener('readystatechange', function () {
      if (xhr.readyState === 3 || xhr.readyState === 4) consumeChunk();
      if (xhr.readyState === 4 && !dispatched) {
        var rest = frameDecoder.finish();
        for (var i = 0; i < rest.length; i++) {
          var parsed = parseBlock(rest[i]);
          if (parsed) extractor.consume(parsed);
        }
        dispatched = true;
        var st = resolveStatus(extractor);
        if (st === 'error') {
          dispatch(extractor.text, 'error', extractor.tokenUsage, extractor.msgIds, { reason: 'xhr', httpStatus: xhr.status, sessionId: reqSessionId });
        } else {
          dispatch(extractor.text, st, extractor.tokenUsage, extractor.msgIds);
        }
      }
    });
  }
}

install();

export { install };
