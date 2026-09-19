# test/_legacy —— 暂缓的旧测试

这些测试**深度 mock 了内部实现**（`Module._load` 猴子补丁 / `vi.mock` 内部模块），
测的是"mock 按预期被调用"，而非"功能真的能用"。

## 为什么暂缓（D21）

P3a 证明了这类测试**不是有效安全网**：280 个测试全绿，但 preload 崩溃、UI 全没，
一个都没抓到。维护它们（尤其每次模块系统/结构变动后改 mock）成本高、收益低。

## 处置

- **重构期**（P3b + P4）：暂缓，不投入精力改造。
- **重构后**：按新结构**重写**（那时结构稳定），并补**集成测试**。
- 安全网改为：`typecheck` + 真机 smoke。

## 清单

| 文件 | 原测对象 |
|---|---|
| profile-manager.test.js | src/main/profile-manager.js |
| project-context.test.js | src/main/project-context.js |
| updater.test.js | src/main/updater.js |
| intercept-observer.test.js | src/preload/dom/intercept-observer.js |
| retry-engine.test.js | src/preload/dom/retry-engine.js |
| tool-loop-watchdog.test.js | src/preload/dom/tool-loop-watchdog.js |
| AttachFileLink.test.js | tools/AttachFileTool.js（fromId 注册） |
| AttachFileTool.execute.test.js | tools/AttachFileTool.js（执行） |
