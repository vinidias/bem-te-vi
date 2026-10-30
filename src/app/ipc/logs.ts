/**
 * µùÑÕ┐ùÕ╝ÇÕà│õ©Äµîüõ╣àÕîû´╝êõ©╗Þ┐øþ¿ïµùÑÕ┐ù + µ©▓µƒôÞ┐øþ¿ï console Þ¢¼ÕÅæ´╝ë
 *
 * Þ«¥Þ«í´╝Ü
 *  - Õ╝ÇÕà│Þ«¥þ¢«Õ¡ÿ `<userData>/log-settings.json`´╝êõ©╗Þ┐øþ¿ïÕÉ»Õè¿µùÂÞâ¢ÕÉîµ¡ÑÞ»╗´╝îõ©ìõ¥ØÞÁû AI ÚíÁÚØó localStorage´╝ë
 *  - console.log / warn / error Õ£¿ÕÉ»Õè¿µùÂµùáµØíõ╗ÂµîéÚÆ®´╝îÕåÖÕàÑµùÂÕåìþ£ï enabled Õ╝ÇÕà│´╝êÕêçµìóÕÉÄþ½ïÕì│þöƒµòê´╝ë
 *  - µ©▓µƒôÞ┐øþ¿ï console ÚÇÜÞ┐ç appendRendererLog ÕåÖÕàÑÕÉîõ©Çµûçõ╗Â
 *  - µùÑÕ┐ùµûçõ╗Â´╝Ü`<userData>/wyp/log/electron.log`
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ipcMain, app, shell } = require('electron');

let enabled = false;
let logStream: fs.WriteStream | null = null;
let hooked = false;

function getLogDir(): string { return path.join(app.getPath('userData'), 'wyp', 'log'); }
function getLogFile(): string { return path.join(getLogDir(), 'electron.log'); }
function getSettingsFile(): string { return path.join(app.getPath('userData'), 'log-settings.json'); }

function readSettings(): { enabled: boolean } {
  try {
    const raw = fs.readFileSync(getSettingsFile(), 'utf-8');
    const obj = JSON.parse(raw);
    return { enabled: !!obj.enabled };
  } catch {
    return { enabled: false };
  }
}

function writeSettings(s: { enabled: boolean }): void {
  try {
    fs.mkdirSync(path.dirname(getSettingsFile()), { recursive: true });
    fs.writeFileSync(getSettingsFile(), JSON.stringify(s, null, 2), 'utf-8');
  } catch (_) { /* ignore */ }
}

function openStream(): void {
  try {
    fs.mkdirSync(getLogDir(), { recursive: true });
    logStream = fs.createWriteStream(getLogFile(), { flags: 'a' });
  } catch (_) { logStream = null; }
}

function closeStream(): void {
  if (logStream) {
    try { logStream.end(); } catch (_) { /* ignore */ }
    logStream = null;
  }
}

function stringify(a: any): string {
  if (typeof a === 'string') return a;
  try { return JSON.stringify(a); } catch (_) { return String(a); }
}

function writeToFile(level: string, args: any[]): void {
  if (!enabled || !logStream) return;
  try {
    const line = '[' + new Date().toISOString() + '] [' + level + '] ' + args.map(stringify).join(' ') + String.fromCharCode(10);
    logStream.write(line);
  } catch (_) { /* ignore */ }
}

const origLog = console.log.bind(console);
const origErr = console.error.bind(console);
const origWarn = console.warn.bind(console);

function hookConsoleOnce(): void {
  if (hooked) return;
  hooked = true;
  console.log = (...args: any[]) => { origLog(...args); writeToFile('LOG', args); };
  console.error = (...args: any[]) => { origErr(...args); writeToFile('ERR', args); };
  console.warn = (...args: any[]) => { origWarn(...args); writeToFile('WARN', args); };
}

/** ÕÉ»Õè¿µùÂÞ░âþö¿´╝ÜÞ»╗Úàìþ¢« ÔåÆ µîéÚÆ® console ÔåÆ Õªéµ×£ÕÀ▓Õ╝ÇÕÉ»ÕêÖµëôÕ╝ÇÕåÖÕàÑµÁü */
export function initLogging(): void {
  // Õ╝ÇÕÅæþëêÕÀ▓þ╗Åþö▒ start.js µèèõ©╗Þ┐øþ¿ï stdout/stderr ÕåÖÕàÑ wyp/log/electron.log´╝î
  // Þ┐ÖÚçîÕÅ¬Õ£¿µëôÕîàþëêþöƒµòê´╝îÚü┐ÕàìÚçìÕñìÕåÖÕàÑÒÇé
  if (!app.isPackaged) return;
  try {
    enabled = readSettings().enabled;
  } catch (_) { enabled = false; }
  hookConsoleOnce();
  if (enabled) openStream();
}

/** µ©▓µƒôÞ┐øþ¿ï console-message Þ░âþö¿´╝êÚù¿µÄºÕ£¿ enabled Úçî´╝ë */
export function appendRendererLog(source: string, message: string): void {
  writeToFile('RENDERER:' + source, [message]);
}

/** µùÑÕ┐ùµûçõ╗Âõ┐íµü»´╝êõ¥øÞ«¥þ¢«ÚíÁÕ▒òþñ║´╝ë */
export function getLogInfo(): { enabled: boolean; dir: string; file: string; size: number } {
  let size = 0;
  try { size = fs.statSync(getLogFile()).size; } catch (_) { /* ignore */ }
  return { enabled, dir: getLogDir(), file: getLogFile(), size };
}

export function registerLogIpc(): void {
  ipcMain.handle('get-log-info', async () => {
    try { return { success: true, ...getLogInfo() }; }
    catch (e: any) { return { success: false, error: e && e.message ? e.message : String(e) }; }
  });
  ipcMain.handle('set-log-enabled', async (_e: any, { enabled: next }: any) => {
    try {
      const on = !!next;
      writeSettings({ enabled: on });
      enabled = on;
      if (on) {
        if (!logStream) openStream();
      } else {
        closeStream();
      }
      return { success: true, enabled };
    } catch (e: any) {
      return { success: false, error: e && e.message ? e.message : String(e) };
    }
  });
  ipcMain.handle('delete-logs', async () => {
    try {
      closeStream();
      const dir = getLogDir();
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
          try { fs.rmSync(path.join(dir, f), { force: true }); } catch (_) { /* ignore */ }
        }
      }
      if (enabled) openStream();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e && e.message ? e.message : String(e) };
    }
  });
  ipcMain.handle('open-log-dir', async () => {
    try {
      const dir = getLogDir();
      fs.mkdirSync(dir, { recursive: true });
      await shell.openPath(dir);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e && e.message ? e.message : String(e) };
    }
  });
}
