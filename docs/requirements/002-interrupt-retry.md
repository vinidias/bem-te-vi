---
id: 002
type: fix
title: AI 回复中断的检测与自动重试
status: done
branch: —
created: 2026-09-20
updated: 2026-09-21
---

## 背景

两个相关的问题：

1. **AI 回复被服务端截断**（网页显示"已停止"，正文没生成完）时，系统把它当作"用户主动停止"而**静默忽略**，不重试，任务无声中断。
2. 修复过程中又出现**误判**：对话正常完成也被判定为中断，导致无谓重试。

## 目标

准确区分三种终态，只有"真正的失败/截断"才触发自动重试：

| 情况 | 期望 |
|---|---|
| 正常完成（finished，有正文） | 不重试 |
| 用户主动停止（点停止按钮） | 不重试（忽略） |
| 服务端截断（INCOMPLETE / 正文为空） | **重试** |

## 方案

在 `src/providers/hooks/deepseek.ts` 的 `resolveStatus` 中：

1. `finished` **优先**（即使同时有 INCOMPLETE 也算完成）——修正"正常完成还重试"
2. 新增判定：`finished` 但**正文为空、只有思考内容** → 归 error（"思考被中断、正文未生成"）
3. 仅 `userStopped`（拦截到 `stop_stream` 请求）才算 `stopped`
4. 其余（非 finished 且非 userStopped）→ 归 error，触发重试

hook 把 error 状态通过 `cuckoo-ai-error` 事件发出，`src/bridge/loop/retry.ts` 订阅后按退避重发提示词。

## 验收标准

- [x] 正常完成不重试
- [x] 用户主动停止不重试
- [x] 服务端截断（正文为空）自动重试
- [x] 真机验证通过

## 遗留 / 后续

- 诊断代码（`dbg` / `snapshot` / 诊断 log）暂留，后续可清理
- `resolveStatus` 的中断判定目前只在 deepseek hook；claude / chatgpt 无对应逻辑
