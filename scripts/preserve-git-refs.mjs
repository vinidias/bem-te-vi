/**
 * Migração: preserva TODAS as refs do remote origin antes de deletar o repo
 * no GitHub. Uso one-shot:
 *
 *   node scripts/preserve-git-refs.mjs dump     # cria backup em .git-preserve/
 *   node scripts/preserve-git-refs.mjs restore <url-novo>  # empurra tudo pro novo
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, '.git-preserve');

const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

function dump() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const heads = sh('git for-each-ref --format="%(refname:short) %(objectname)" refs/heads');
  const remotes = sh('git for-each-ref --format="%(refname:short) %(objectname)" refs/remotes/origin')
    .split('\n').filter((l) => l && !l.includes('origin/HEAD')).join('\n');
  const tags = sh('git for-each-ref --format="%(refname:short) %(objectname)" refs/tags');
  fs.writeFileSync(path.join(OUT_DIR, 'refs.txt'), [heads, '---REMOTES---', remotes, '---TAGS---', tags].join('\n') + '\n');
  fs.writeFileSync(path.join(OUT_DIR, 'HEAD.txt'), sh('git rev-parse HEAD') + '\n');
  console.log('[preserve] salvo em', path.relative(ROOT, OUT_DIR));
}

function restore(url) {
  if (!url) throw new Error('uso: restore <url-novo>');
  sh(`git remote set-url origin ${url}`);
  // empurra todos os branches locais
  sh('git push origin --all');
  // empurra branches que só existiam no remoto antigo, via refspec
  const remotes = sh('git branch -r --format="%(refname:short)"')
    .split('\n')
    .filter((l) => l.startsWith('origin/') && l !== 'origin' && !l.includes('HEAD'));
  const locals = new Set(sh('git branch --format="%(refname:short)"').split('\n'));
  const only = remotes.filter((r) => !locals.has(r.replace(/^origin\//, '')));
  if (only.length) {
    const spec = only.map((r) => `${r}:refs/heads/${r.replace(/^origin\//, '')}`).join(' ');
    sh(`git push origin ${spec}`);
    console.log('[preserve] empurrados', only.length, 'branches só-remotos');
  }
  sh('git push origin --tags');
  console.log('[preserve] restore concluído para', url);
}

const [,, cmd, arg] = process.argv;
if (cmd === 'dump') dump();
else if (cmd === 'restore') restore(arg);
else console.log('uso: dump | restore <url>');
