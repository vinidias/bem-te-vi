import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { languageOrDefault } from './scripts/lib/language.mjs';
const require = createRequire(import.meta.url);
const { app, ipcMain } = require('electron');
app.setName('Bem-te-vi');
const sessionDir = process.env.BEM_TE_VI_SESSION_DIR || process.env.CUCKOO_SESSION_DIR || 'bem-te-vi';
const dataDir = path.join(app.getPath('appData'), sessionDir);
fs.mkdirSync(dataDir, { recursive: true });
app.setPath('userData', dataDir);
const preferenceFile = path.join(dataDir, 'language.json');
let preference = 'pt-BR';
try { preference = languageOrDefault(JSON.parse(fs.readFileSync(preferenceFile, 'utf8')).language); } catch { /* First launch or invalid preference: Portuguese. */ }
const language = languageOrDefault(process.env.BEM_TE_VI_LANGUAGE || preference);
process.env.BEM_TE_VI_LANGUAGE = language;
app.commandLine.appendSwitch('lang', language);
ipcMain.handle('bem-te-vi-language-get', () => ({ language, preference }));
ipcMain.handle('bem-te-vi-language-set', (event, selected) => {
  const senderUrl = new URL(event.sender.getURL());
  const expected = path.join(import.meta.dirname, 'src', 'ui', 'shell.' + language + '.html');
  if (senderUrl.protocol !== 'file:' || path.resolve(fileURLToPath(senderUrl)) !== expected) {
    throw new Error('Language preferences can only be changed from the application settings.');
  }
  if (!['pt-BR', 'en', 'zh-CN'].includes(selected)) throw new Error('Unsupported language');
  fs.writeFileSync(preferenceFile + '.tmp', JSON.stringify({ language: selected }) + '\n');
  fs.renameSync(preferenceFile + '.tmp', preferenceFile);
  preference = selected;
  return { language, preference, restartRequired: language !== selected };
});
await import('./out/localized/' + language + '/src/app/entry.js');
