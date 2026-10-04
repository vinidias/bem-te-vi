import { scanAgents } from '../out/src/agents/scanner.js';
for (const d of ['B:\\免费网页Agent', 'Z:\\', null]) {
  try { const a = scanAgents(d); console.log(JSON.stringify(d) + ' -> ' + a.length + ' 个: ' + a.map(x=>x.name+'(来源'+x.source+')').join(', ')); }
  catch (e) { console.log(JSON.stringify(d) + ' -> ERR ' + e.message); }
}
console.log('user home agents -> ' + scanAgents(null).length);
