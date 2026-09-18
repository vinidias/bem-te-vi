# Cuckoo Code 重构计划

> 状态：草稿 v0.1
> 配套：`01-architecture.md` / `02-modules.md` / `03-decisions.md`
> 原则：每阶段可独立验证；每 PR 只做一件事；测试全绿才进下一步。

---

## 总览

| 阶段 | 目标 | 时长 | 风险 |
|---|---|---|---|
| P0 | 定义边界（文档） | 1 周 | 零 |
| P1 | 清理死代码 | 1-2 周 | 低 |
| P2 | TS 基建 + 依赖护栏 | 1 周 | 低 |
| P3 | TS 渐进迁移 | 2-4 周 | 中 |
| P4 | 按新边界重构 | 4-8 周 | 高 |
| P5 | 收紧与收尾 | 1 周 | 低 |

**里程碑**：P2 结束时可随时暂停（有 TS 基建，代码仍可用）；P3 结束时代码全 TS；P4 结束达到目标架构。

---

## P0 —— 定义边界（当前阶段）

**目标**：产出架构文档，不写代码。

**任务**：
- [x] `00-goal.md` —— 目标/约束（用户写）
- [x] `01-architecture.md` —— 目标架构（草稿）
- [x] `02-modules.md` —— 模块职责表（草稿）
- [x] `03-decisions.md` —— 决策记录（草稿）
- [x] `04-plan.md` —— 本文件
- [ ] 用户 review 全部文档
- [ ] 拍板 D3 / D4 / D5 / D10
- [ ] 补齐 `00-goal.md`

**验收**：用户对架构与模块划分认可；所有阻塞决策有结论。

**注意**：本阶段**不动任何源码**。

---

## P1 —— 清理死代码

**目标**：只删不加，行为 100% 不变。

**任务**：
- [ ] 删 `tools/GlobTool.js` + `tools/GrepTool.js`（旧版，死代码）
- [ ] 删 `test/tools/LegacyGlobGrep.test.js`
- [ ] 清理 `tools/index.js` 对应 import/register/export
- [ ] 清理 `src/preload/tool-names.js` 的 `file_glob`/`file_grep`
- [ ] **修 bug**：`tool-names.js` 缺 `mcp_call`
- [ ] 视 D4 决策：删/留旧别名与对应工具
- [ ] 视 D5 决策：合并 `src/prompt/*.md`
- [ ] 清理根目录生成文件（`build-*.log`、`coverage.lcov` 等）出 git

**验收**：
- `node --test` 全绿
- 源码行数下降（目标 -10%）
- `cuckoo-tools.d.ts` 契约未变
- 应用能 `npm start` 启动并完成一次工具调用

**风险**：误删被动态引用的代码 → 每次删除后立刻跑测试。

---

## P2 —— TS 基建 + 依赖护栏

**目标**：引入 TS，但不改任何源码逻辑。

**任务**：
- [ ] 装依赖：`typescript` / `@types/node` / `@types/electron`（或 electron 自带）
- [ ] `tsconfig.json`：`allowJs: true`、`checkJs: false`、`strict: false`、`noEmit: true`
- [ ] 加脚本：`npm run typecheck` = `tsc --noEmit`
- [ ] 引入 ESLint + `import/no-restricted-paths`（D8）
- [ ] CI 加 typecheck + lint（`.github/workflows/`）
- [ ] 处理 `tools/cuckoo-tools.d.ts` 与 tsconfig 的关系

**验收**：
- `npm run typecheck` 通过（此时只有 `.d.ts` 和 `.js`，无报错）
- 写一个违规 import（如 infra 引 tools）→ ESLint 报错
- 测试全绿（未动源码）

**风险**：TS 与 Electron 类型冲突 → 用 `skipLibCheck` 兜底。

---

## P3 —— TS 渐进迁移

**目标**：把 `src/` 与 `tools/` 全迁 TS，**行为不变**。

**顺序（叶子 → 根）**：
1. `infra/`（无依赖）
2. `providers/`
3. `tools/core/` + `tools/impl/`（先简单工具，后 JsRunner）
4. `session/`
5. `bridge/parser/`（纯函数，易迁）
6. `bridge/loop/` + `bridge/intercept/`
7. `overlay/`
8. `app/`
9. `mcp/` + `updater/`

**每文件迁移流程**：
1. 重命名 `.js` → `.ts`
2. 加最小类型标注（允许 `any`）
3. `tsc --noEmit` 通过
4. 测试全绿
5. 一个 commit

**验收**：
- 所有 `src/**/*.js` 变为 `.ts`
- `tsc --noEmit` 通过
- 测试全绿
- 应用可正常启动、工具可正常调用
- 每个文件一个 commit，可逐步回滚

**风险**：
- 循环依赖暴露 → 就地小修，不扩大
- 动态 require（如 `require('../providers')`）→ 显式类型
- Electron 的 renderer/main 类型差异 → 用 `process.type` 判断分支

---

## P4 —— 按新边界重构

**目标**：达到 `01-architecture.md` 的目标结构。

**分 5 个子阶段，每阶段独立可交付**：

### P4.1 主进程拆分
- [ ] `src/main/index.js` → `src/app/entry.ts` + `infra/paths.ts`
- [ ] `src/main/ipc.js` → `src/app/ipc/{project,session,command,tool}.ts`
- [ ] `src/main/window.js` → `src/app/window.ts`
- [ ] `src/main/profile-manager.js` → `src/app/profile.ts`
- [ ] 其余 main 文件按映射表归位

### P4.2 preload 归位
- [ ] `src/preload/dom/state.js` 拆解到各领域
- [ ] `src/preload/dom/*` → `src/bridge/**` 或 `src/overlay/**`
- [ ] `src/preload/tool-names.js` 删除，白名单从 registry 生成
- [ ] `src/preload/overlay/*` → `src/overlay/**`

### P4.3 tools 重组
- [ ] `tools/` → `src/tools/`
- [ ] 内部按 `core/ runtime/ impl/` 重组
- [ ] 同步改 `package.json`（extraResources）、electron-builder、测试路径

### P4.4 providers 内部分目录
- [ ] `providers/deepseek.js` → `providers/deepseek/{index,hook}.ts`
- [ ] 三份同理；抽出公共 SSE 解码逻辑

### P4.5 拆巨型文件
- [ ] `overlay/events.ts`（813 行）→ 按面板区域拆
- [ ] `overlay/template.ts`（526 行）→ 按区块拆或外置 HTML
- [ ] `session/project-context.ts`（288 行）→ 拆提示词拼装

**验收（每子阶段）**：
- ESLint 依赖规则零违规
- 测试全绿
- 应用功能不回归（手动冒烟关键路径）
- 目录结构与文档一致

**风险**：这是最长的阶段，冲突最多。需 D10 冻结策略支持。

---

## P5 —— 收紧与收尾

**目标**：提升质量，清理残留。

**任务**：
- [ ] `tsconfig` 开 `strict: true`，逐个消灭 `any` 与 `@ts-ignore`
- [ ] 删旧 JS API 别名（若 P1 未删）
- [ ] 删所有兼容层
- [ ] 补关键路径测试（bridge / overlay 覆盖不足）
- [ ] 更新 `README` / `CONTRIBUTING` / `CHANGELOG`
- [ ] 更新 `docs/refactor/` 状态为「已完成」
- [ ] 归档本目录到 `docs/archive/refactor-2026/`

**验收**：
- `strict` 通过
- 无死代码（用工具扫）
- 测试覆盖率达标
- 文档与代码一致

---

## 全程纪律

1. **每 PR 只做一件事** —— 不混合迁移与重构。
2. **测试全绿才合并** —— 红了立刻回滚，不带病前进。
3. **契约变更记录** —— 改 `cuckoo-tools.d.ts` 必须更新 `03-decisions.md`。
4. **阶段边界暂停** —— P1 / P2 / P3 结束都是「可交付点」，可暂停。
5. **每周进度报告** —— 阶段内每完成一批任务出一份简报。

---

## 当前行动

**P0 收尾**：
1. 你 review `01`–`04` 四份文档
2. 拍板 D3 / D4 / D5 / D10
3. 补 `00-goal.md`

**完成后进入 P1。**
