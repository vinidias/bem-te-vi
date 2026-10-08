import fs from 'node:fs';
import path from 'node:path';
import { localizeJavaScript, localizeHtml } from './lib/localization.mjs';
const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'out', 'src');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
for (const language of ['pt-BR', 'en', 'zh-CN']) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'locales', language + '.json'), 'utf8'));
  let count = 0;
  for (const file of walk(source)) {
    const rel = path.relative(source, file);
    const dest = path.join(root, 'out', 'localized', language, 'src', rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (/^(app|overlay|updater|ui)[\\/]/.test(rel) && file.endsWith('.js')) {
      fs.writeFileSync(dest, localizeJavaScript(fs.readFileSync(file, 'utf8'), catalog));
      count++;
    } else fs.copyFileSync(file, dest);
  }
  for (const name of ['shell', 'platform-select', 'harness', 'feishu-setup']) {
    const file = path.join(root, 'src', 'ui', name + '.html');
    fs.writeFileSync(path.join(root, 'src', 'ui', name + '.' + language + '.html'),
      localizeHtml(fs.readFileSync(file, 'utf8'), catalog, language));
  }
  console.log(`[locales] ${language}: ${Object.keys(catalog).length} strings, ${count} modules, 4 pages`);
}
