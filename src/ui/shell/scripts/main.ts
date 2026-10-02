/**
 * 壳页面脚本入口。
 * 导入各模块（副作用：绑定事件），注册 tab 加载器，做预加载。
 */
import { api } from './shared.js';
import { registerTab } from './sidebar.js';
import './toolbar.js';
import './platform.js';

import { loadSnippets } from './pages/snippets.js';
import { loadSkills } from './pages/skills.js';
import { loadAgents } from './pages/agents.js';
import { loadMcpServers } from './pages/mcp.js';
import { loadAutoCompact } from './pages/token.js';
import { loadAbout } from './pages/about.js';
import { loadFeishu } from './pages/feishu.js';
import { renderWindowList } from './pages/windows.js';
import { loadSettings } from './pages/settings.js';

// 注册 tab → 加载函数（sidebar 点击时调用）
registerTab('snippets', loadSnippets);
registerTab('skills', loadSkills);
registerTab('agents', loadAgents);
registerTab('mcp', loadMcpServers);
registerTab('token', loadAutoCompact);
registerTab('about', loadAbout);
registerTab('feishu', loadFeishu);
registerTab('windows', renderWindowList);
registerTab('settings', loadSettings);

// 预加载：提示词 + 自动压缩配置
try { loadSnippets(); } catch (_) { /* ignore */ }
try { loadAutoCompact(); } catch (_) { /* ignore */ }

// 其他窗口改了提示词 → 本窗口同步刷新
if ((api as any).onSnippetsChanged) {
  (api as any).onSnippetsChanged(() => { try { loadSnippets(); } catch (_) { /* ignore */ } });
}
