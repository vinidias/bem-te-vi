import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { BrowserWindow } = require('electron');

class BrowserWindowManager {
  constructor() {
    this.windows = new Map();
    this.nextAutoId = 1;
  }

  openWindow(customId, url, options = {}) {
    let id;
    if (customId) {
      if (this.windows.has(customId)) {
        throw new Error(`窗口 ID "${customId}" 已存在，请换一个 ID 或复用现有窗口`);
      }
      id = customId;
    } else {
      do {
        id = `win-${this.nextAutoId++}`;
      } while (this.windows.has(id));
    }

    const win = new BrowserWindow({
      width: options.width || 1200,
      height: options.height || 800,
      ...options
    });

    // 设置与主窗口一致的 Chrome 130 普通 UA，避免暴露 Electron 标识
    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    win.webContents.setUserAgent(userAgent);

    if (url) win.loadURL(url);
    this.windows.set(id, win);
    win.on('closed', () => this.windows.delete(id));
    return id;
  }

  async injectJS(id, jsCode) {
    const win = this.windows.get(id);
    if (!win) throw new Error(`窗口 ID "${id}" 不存在`);

    // 语法探测：优先按"单个表达式"解析，失败则按"函数体（多条语句）"解析
    // 这样既支持 `1+2`、`(() => {...})()` 这类表达式，也支持
    // `return x`、`const a=1; return a`、`if (...) return x`、顶层 await 等多语句代码
    let mode; // 'expression' | 'body'
    try {
      // eslint-disable-next-line no-new-func
      new Function('return (' + jsCode + '\n)');
      mode = 'expression';
    } catch (e) {
      try {
        // eslint-disable-next-line no-new-func
        new Function('return (async () => {\n' + jsCode + '\n})');
        mode = 'body';
      } catch (e2) {
        throw new Error(`JS 语法错误: ${e2.message}`);
      }
    }

    const wrapped =
      mode === 'expression'
        ? `(async () => {
  try {
    const __result = await (${jsCode});
    return { ok: true, value: __result };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
})()`
        : `(async () => {
  try {
    const __result = await (async () => {
${jsCode}
    })();
    return { ok: true, value: __result };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
})()`;

    const result = await win.webContents.executeJavaScript(wrapped, true);
    if (result && result.ok === false) {
      throw new Error(result.error);
    }
    return result ? result.value : undefined;
  }

  getWindow(id) {
    const win = this.windows.get(id);
    if (!win) throw new Error(`窗口 ID "${id}" 不存在`);
    return win;
  }

  getAllWindowIds() {
    return Array.from(this.windows.keys());
  }

  closeWindow(id) {
    const win = this.getWindow(id);
    win.close();
    this.windows.delete(id);
  }
}

const windowManager = new BrowserWindowManager();
export { windowManager };
