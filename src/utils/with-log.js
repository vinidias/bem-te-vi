'use strict';

/**
 * 方法调用日志包装（类 AOP）
 *
 * 用法一（包装整个模块导出）：
 *   module.exports = withLog(module.exports, 'retry-engine');
 *
 * 用法二（包装单个函数）：
 *   const handleError = withLog(function handleError(detail) { ... }, 'retry.handleError');
 *
 * 说明：
 * - 打印入参、出参；返回值是 Promise 时额外打印解析值/拒绝原因。
 * - 参数/返回值做安全序列化（超长截断、循环引用兜底）。
 * - 仅覆盖被包装的函数；模块内部未包装的私有函数不会被自动记录。
 */

function safeStr(v) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return v.length > 200 ? v.slice(0, 200) + '...' : v;
  if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
  try {
    const s = JSON.stringify(v);
    if (s === undefined) return String(v);
    return s.length > 200 ? s.slice(0, 200) + '...' : s;
  } catch (_) {
    return String(v);
  }
}

function withLog(fn, label) {
  const name = label || fn.name || 'anonymous';
  const prefix = '[AOP][' + name + ']';
  return function (...args) {
    const argsStr = args.map(safeStr).join(', ');
    console.log(prefix + ' >> (' + argsStr + ')');
    let r;
    try {
      r = fn.apply(this, args);
    } catch (e) {
      console.log(prefix + ' << 抛错: ' + (e && e.message));
      throw e;
    }
    if (r && typeof r.then === 'function') {
      return r.then(
        (v) => { console.log(prefix + ' << (Promise) => ' + safeStr(v)); return v; },
        (e) => { console.log(prefix + ' << (Promise) 拒绝: ' + (e && e.message)); throw e; }
      );
    }
    console.log(prefix + ' << => ' + safeStr(r));
    return r;
  };
}

/** 包装对象（通常是 module.exports）上的所有方法，原地替换 */
function withLogObject(mod, moduleName) {
  const prefix = '[AOP][' + (moduleName || 'module') + ']';
  for (const key of Object.keys(mod)) {
    const fn = mod[key];
    if (typeof fn !== 'function') continue;
    mod[key] = withLog(fn, (moduleName ? moduleName + '.' : '') + key);
  }
  return mod;
}

export { withLog, withLogObject };
