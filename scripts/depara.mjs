/**
 * Gera a tabela "de-para" (de → para) das traduções.
 * Lê locales/{pt-BR,en,zh-CN}.json e emite locales/depara.csv
 * (UTF-8 com BOM + CRLF para abrir direto no Excel/LibreOffice).
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const locales = ['pt-BR', 'en', 'zh-CN'];
const catalogs = Object.fromEntries(
  locales.map((l) => [l, JSON.parse(fs.readFileSync(path.join(root, 'locales', l + '.json'), 'utf8'))])
);
const keys = Object.keys(catalogs['pt-BR']).sort();

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const header = ['source (zh)', ...locales];
const rows = [header.map(csvCell).join(',')];
for (const k of keys) rows.push([k, ...locales.map((l) => catalogs[l][k] ?? '')].map(csvCell).join(','));

const out = path.join(root, 'locales', 'depara.csv');
fs.writeFileSync(out, '\ufeff' + rows.join('\r\n') + '\r\n', 'utf8');
console.log('[depara] ' + keys.length + ' chaves -> ' + path.relative(root, out));
