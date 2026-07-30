# M｜产品状态机与事件模型

## 1. 八个真实运行状态

| 状态 | 含义 | 允许的主动作 | 运行时证据 |
| --- | --- | --- | --- |
| `idle` | 没有活动流 | 选择场景、开始写意图、主动报告漂移 | `createSession()` 默认值 |
| `intention` | 正在定义去向 | 编辑目标与下一步、封存 checkpoint | 输入聚焦或场景选择触发 `BEGIN_INTENTION` |
| `waiting` | 外部任务处理或用户等待 | 选择恢复动作、完成、失败、提前回来 | `checkpointAt` 与可选 `expectedAt` |
| `recovery` | 主动给身体/大脑一个低刺激间隙 | 完成恢复、继续等待、接收任何结果 | `microActionAt` 与 `microAction` |
| `drift` | 用户主动报告偏航 | 保留/改变目的、缩小下一步 | 只由 `REPORT_DRIFT` 进入 |
| `return` | 结果或自救信号已到达 | 一击接回封存动作 | `taskOutcome`、`returnedAt` |
| `active` | 已回到真实任务 | 完成第一步、再开空档、报告漂移 | `rejoinedAt`、`returnLatencyMs` |
| `review` | 极短恢复质量复盘 | 完整/部分/丢失/跳过 | `review` 与本地历史 |

`Recovery` 不是 Waiting 的文案别名：用户选择“留白/远眺/伸展/一句判断”时发生真实状态转换；模拟 adapter 在该状态仍继续计时，结果到达会直接进入 Return。

## 2. 主要转换

```text
idle -> intention -> waiting -> recovery -> waiting
                         |          |
                         +----------+-> return -> active -> review

idle/intention/waiting/recovery/return/active -> drift -> return
waiting/recovery -> return (complete / failed / early)
任意状态 -> idle (NEW_SESSION，明确开始下一条流)
任意状态 -> 同状态 (PAGE_VISIBILITY，不等同 drift)
```

非法转换会抛出 `Illegal Inkflow transition`；陈旧 `HYDRATE` revision 会被拒绝。

## 3. 规范化事件

| 任务书事件 | 第一版来源 | 真实性 | 实现映射 |
| --- | --- | --- | --- |
| `wait_started` | 用户封存 | 真实用户动作 | `START_WAIT` |
| `checkpoint_saved` | 用户提交最小文本 | 真实 | 与 `wait_started` 同批追加 |
| `drift_detected` | 用户点击“我飘走了” | 仅自报，不自动侦测 | `REPORT_DRIFT` |
| `micro_action_selected` | 用户选择 | 真实，留白也是选择 | `SELECT_MICRO_ACTION` |
| `ai_completed` | 手动或模拟 adapter | 带 `source` | `SIGNAL_DONE` |
| `return_prompted` | 进入 Return | 真实 UI 状态，不等于通知送达 | 与完成/失败/救援同批追加 |
| `return_confirmed` | 用户点击 Return Gate | 真实 | `REJOIN` |
| `return_latency` | Return 到 Rejoin | 真实计算 | `REJOIN` 第二条事件 |
| `context_recalled` | 用户主观 Review | 真实自评，不伪装脑状态 | `RECORD_REVIEW` |
| `session_closed` | Review 完成或跳过 | 真实 | `RECORD_REVIEW` 第二条事件 |

补充事件：`ai_failed`、`page_visibility_changed`、`micro_action_completed`、`first_step_completed`。所有事件追加到本地环形队列，最多 240 条。

## 4. 当前数据模型（schema v1）

```ts
type FlowStage =
  | "idle" | "intention" | "waiting" | "recovery"
  | "drift" | "return" | "active" | "review";

type FlowSession = {
  schemaVersion: 1;
  id: string;
  revision: number;
  stage: FlowStage;
  mode: "ai" | "work" | "read" | "meditate";
  objective: string;
  nextAction: string;
  source: "manual" | "simulation";
  microAction: "blank" | "look" | "stretch" | "prompt";
  lowEnergy: boolean;
  checkpointAt: number | null;
  expectedAt: number | null;
  microActionAt: number | null;
  recoveryCompletedAt: number | null;
  signaledAt: number | null;
  returnedAt: number | null;
  rejoinedAt: number | null;
  completedAt: number | null;
  returnLatencyMs: number | null;
  taskOutcome: "completed" | "failed" | "early" | "rescue" | null;
  review: "complete" | "partial" | "lost" | "skipped" | null;
  pageVisibility: "visible" | "hidden";
  hiddenCount: number;
  lastHiddenAt: number | null;
  lastVisibleAt: number | null;
};
```

Profile 同为 schema v1，保存 onboarding、通知决定、静默偏好、低能量偏好、首选场景/恢复动作与完成接回次数。

## 5. 检测与伦理边界

- `visibilitychange` 只记录墨流页面是否可见；不会把页面隐藏解释成刷抖音、拿手机或漂移。
- 普通 Web App 不读取 Codex、Claude、Cursor、其他标签页、浏览历史、Prompt 或代码。
- 手动 adapter 不设置定时完成；模拟 adapter 只根据持久化的 `expectedAt` 产生明确标注的模拟信号。
- 通知拒绝与不支持会被记住；核心流程降级为页面标题和 Return Gate。
- checkpoint 正文只用于本机 UI 与快照，不进入 adapter payload、通知正文或 BroadcastChannel 消息。
