import { scanAgents } from '../out/src/agents/scanner.js';
const a = scanAgents(null);
console.log('用户级扫描: ' + a.length + ' 个 -> ' + a.map(x=>x.name).join(', '));
