# P4 输入：迁移过程中发现的结构性问题

> 来源：P3a（ESM 转换）+ P3b（TS 迁移）过程中暴露的既有问题。
> 原则：迁移期**只记录、不顺手重构**（D1）。P4 按目标架构统一处理。
> 时间：2026-09-19 ~ 2026-09-20

---

## 1. preload 循环依赖网（P3a 发现）

详见 `P4-input-preload-deps.md`。

**摘要**：`chat-input ↔ tool-loop-watchdog` 等形成循环依赖，原用懒 require 打破，
P3a 改为 ESM 静态 import（活绑定）后可运行，但仍是脆弱结构。

**P4 方向**：引入事件总线解耦，或提取公共底层模块。

---

## 2. tools → src/main 依赖违规（P3b 发现，3 处）

**位置**：
```
tools/McpCallTool.ts:46    const mcpClient = require('../src/main/mcp-client');
tools/McpQueryTools.ts:34  const mcpClient = require('../src/main/mcp-client');
tools/McpQueryTools.ts:93  const mcpClient = require('../src/main/mcp-client');
```

**问题**：违反架构依赖方向（tools 不得依赖 app/main）。
eslint.config.js 目前用 `except: ['mcp-client']` 豁免（标注"P4 解耦后移除"）。

**额外风险**：这 3 处是**惰性 require**（在 execute() 体内）。迁移 mcp-client.js→.ts 后，
**源码态（vitest）会解析失败**（找不到 .ts），仅编译产物 out/ 下正常。
当前测试未触发这些路径，故暂绿——**是潜伏雷**。

**P4 方向**：把 mcp-client 下沉到 `src/infra/mcp/`，tools 依赖 infra 而非 main。
然后移除 eslint 的 except 豁免。

---

## 3. flashBadge 形参不匹配（P3b 发现）

**位置**：
```
src/preload/overlay/ui.ts:flashBadge()        ← 定义无参
src/preload/dom/tool-executor.ts:19/30        ← 调用传参（被忽略）
```

**现状**：P3b 已改为 `flashBadge(_title?: string)`（类型诚实，运行时行为不变）。

**P4 方向**：决定"这个 title 该不该真的用"——若该用，实现它（显示在提示里）；
若不该用，调用点删实参。**当前是有意保留的信息，待 P4 决策**。

---

## 4. retry-engine 的 AOP 重赋值（P3b 发现）

**位置**：`src/preload/dom/retry-engine.ts`（10 处）
```
let readConfig = function readConfig() {...};
...
readConfig = withLog(readConfig, 'retry.readConfig');   ← 运行时猴子补丁
```

**问题**：这是**运行时重赋值**（类 AOP）。在 TS 下必须用 `let ... = function` 迁就
（TS2630：function 声明不能重赋值）。说明此模式**天生和类型系统打架**。

**P4 方向**：AOP 日志装饰器该不该改成**显式包装**（`const readConfig = withLog(...)`
一次性定义），而非事后重赋值？让类型系统自然接受。

---

## 5. 失败路径缺测试（P3b 发现，D20 bug 暴露）

**事件**：D20 重构（我做的）漏改了 `project-context` 错误分支的引用
（删了 `toolApiTypePaths` 声明却漏改引用它的 `console.error`）。
**218 测试全绿，没抓到**——因为没有测试覆盖该失败路径。

**含义**：当前测试是"快乐路径"测试，覆盖不了健壮性。

**P4 方向**：补**失败路径测试**（文件缺失、加载失败、会话切换、超时等）。

---

## 6. ESLint 对 .ts 失效（P3b 发现，D22）

**问题**：
- eslint.config.js 只配 `**/*.js`，src/tools 迁 .ts 后**完全不被检查**。
- 自定义依赖护栏规则只匹配 `require()`，不匹配 ESM `import`。

**现状**：推迟到 P5（typescript-eslint 与 TS7 不兼容，D22）。

**P4/P5 方向**：TS7 生态跟上后，用 typescript-eslint 覆盖 .ts，
并扩展护栏规则识别 import。届时护栏才能在 P4 重组中发挥作用。

---

## 7. provider.template.js 保留（有意）

`src/providers/custom/provider.template.js` 是**模板资产**（供用户复制改写的样例），
**不是运行时模块**，故保持 .js。P4 若调整自定义 provider 机制，一并评估。

---

## 汇总：P4 待办清单

- [ ] 解耦 preload 循环依赖（事件总线/公共模块）
- [ ] mcp-client 下沉到 infra，消除 tools→main 违规
- [ ] flashBadge title 语义决策
- [ ] retry-engine AOP 改为显式包装
- [ ] 补失败路径测试
- [ ] （P5）ESLint 覆盖 .ts + 护栏识别 import
