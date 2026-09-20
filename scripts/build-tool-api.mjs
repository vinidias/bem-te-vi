/**
 * 生成工具 API 契约（D12）
 *
 * 真相源：各工具的 apiMetas 元数据（src/tools/impl/*.ts）。
 * 本脚本读取编译产物 out/src/tools/impl/*.js，汇总 apiMetas，生成 src/tools/api.d.ts。
 * 在 tsc 编译之后运行（见 package.json 的 compile 脚本）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const NL = String.fromCharCode(10);
const ROOT = path.resolve(import.meta.dirname, '..');
const IMPL_DIR = path.join(ROOT, 'out', 'src', 'tools', 'impl');
const OUT = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, 'src', 'tools', 'api.d.ts');

async function collect() {
  const metas = [];
  for (const f of fs.readdirSync(IMPL_DIR)) {
    if (!f.endsWith('.js')) continue;
    const mod = await import(pathToFileURL(path.join(IMPL_DIR, f)).href);
    if (Array.isArray(mod.apiMetas)) metas.push(...mod.apiMetas);
  }
  metas.sort((a, b) => a.order - b.order);
  return metas;
}

function render(metas) {
  const L = [];
  L.push('/**');
  L.push(' * Cuckoo Code 工具 API（TypeScript 声明）');
  L.push(' *');
  L.push(' * 本文件描述 cuckoo 代码块中可以调用的全部全局函数与数据类型。');
  L.push(' * 运行时由 JsRunner 在受限沙箱中注入这些函数；本声明用于帮助');
  L.push(' * AI 理解调用方式，与运行时行为保持一致。');
  L.push(' *');
  L.push(' * 使用规则速览：');
  L.push(' * - 所有工具函数都是异步的，调用时必须写 await');
  L.push(' * - 相对路径基于全局变量 projectDir（当前项目根目录）解析');
  L.push(' * - 多行文本使用反引号（\u0060）模板字符串，不需要任何转义');
  L.push(' * - 工具出错时抛出异常（Error.message 为错误描述），可用 try/catch 处理；');
  L.push(' *   唯一例外是 bash()/pwsh()：非零退出不抛异常，通过返回文本中的 [exit code] 标记报告');
  L.push(' * - 用 log() 输出中间过程；脚本最后可用 return 返回结果值');
  L.push(' *');
  L.push(' * ⚠️ 本文件由 scripts/build-tool-api.mjs 自动生成，请勿手动编辑。');
  L.push(' *    真相源：各工具的 apiMetas 元数据（src/tools/impl/*.ts）。');
  L.push(' */');
  L.push('');
  L.push('/** 当前项目根目录（初始化项目后由系统注入）。未初始化时为 null。 */');
  L.push('declare const projectDir: string | null;');
  L.push('');
  L.push('/**');
  L.push(' * 输出中间结果到执行日志（不中断脚本）。');
  L.push(' * 日志内容随执行结果一起回传给 AI。');
  L.push(' * 注意：log() 只在 cuckoo 代码块的 JS 层可用。不要在 bash()/pwsh() 的命令字符串内部调用它——那些命令是独立的 shell 脚本，无法访问 JS 函数。');
  L.push(' */');
  L.push('declare function log(...args: unknown[]): void;');

  let lastCat = null;
  for (const m of metas) {
    if (m.category !== lastCat) {
      L.push('');
      L.push('// ================= ' + m.category + ' =================');
      L.push('');
      lastCat = m.category;
    }
    if (m.types) {
      L.push(m.types);
      L.push('');
    }
    L.push('/**');
    for (const line of m.doc.split(NL)) {
      L.push(' * ' + line);
    }
    if (m.paramDocs) {
      for (const k of Object.keys(m.paramDocs)) {
        L.push(' * @param ' + k + ' ' + m.paramDocs[k]);
      }
    }
    if (m.returnsDoc) {
      L.push(' * @returns ' + m.returnsDoc);
    }
    if (m.throws) {
      L.push(' * @throws ' + m.throws);
    }
    L.push(' */');
    L.push('declare function ' + m.name + '(' + m.params + '): ' + m.returns + ';');
    L.push('');
  }
  return L.join(NL);
}

const metas = await collect();
if (metas.length === 0) {
  console.error('[build-tool-api] 未收集到任何 apiMetas');
  process.exit(1);
}
fs.writeFileSync(OUT, render(metas), 'utf8');
console.log('[build-tool-api] 生成 ' + path.relative(ROOT, OUT) + '（' + metas.length + ' 个工具）');
