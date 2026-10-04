process.env.CUCKOO_HOME = (process.env.USERPROFILE || process.env.HOME) + '/.cuckoo';
const roots = await import('../out/src/plugins/roots.js');
const ws = roots.getEnabledPluginWebScripts();
console.log('web scripts: ' + JSON.stringify(ws, null, 2));
