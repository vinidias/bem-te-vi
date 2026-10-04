import { scanAgents } from '../out/src/agents/scanner.js';
for (const d of ['Z:\\', 'E:\\valkyr-api-python\\projects\\rvc-vulkan']) {
  const a = scanAgents(d);
  console.log(JSON.stringify(d) + ' -> ' + a.length + ' 个: ' + a.map(x=>x.name+'('+x.source+')').join(', '));
}
