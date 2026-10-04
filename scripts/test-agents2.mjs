import { scanAgents } from '../out/src/agents/scanner.js';
for (const d of ['E:\\valkyr-api-python\\projects\\rvc-vulkan', 'D:\\Downloads', 'B:\\world.execute (me)']) {
  try { const a = scanAgents(d); console.log(JSON.stringify(d) + ' -> ' + a.length + ' 个: ' + a.map(x=>x.name).join(',')); }
  catch (e) { console.log(JSON.stringify(d) + ' -> ERR ' + e.message); }
}
