# M — 产品状态机与事件模型

## 状态

| 状态 | 含义 | 允许的主动作 | 界面原则 |
|---|---|---|---|
| `Idle` | 没有活动 session | 新建注意力去向、恢复最近 checkpoint | 只显示一个入口与最近一条 |
| `Intention` | 正在定义去向 | 选择 AI/工作/阅读/冥想，写 intent | 不出现统计与设置墙 |
| `Active` | 用户在真实任务中 | 开始等待、主动 checkpoint、报告偏航、结束 | 墨流退到边缘 |
| `Waiting` | Agent/系统处理中或用户手动计时模拟 | 留白、拉取微行动、标记提前完成/失败 | 中段留白，不制造内容流 |
| `Drift` | 用户主动报告偏航，或仅发现页面曾隐藏（不得等同偏航） | 保留/改变目的，重算下一步 | 不显示失败计数 |
| `Return` | 完成后正在恢复上下文 | 回忆、揭示 checkpoint、接回第一步 | signature 断线合流 |
| `Recovery` | 用户主动选择身体/大脑恢复 | 远眺、呼吸、伸展、留白、提前回来 | 低刺激，可随时退出 |
| `Review` | 第一动作或 session 结束后的轻反馈 | 评估上下文恢复、关闭/继续 | 一题即走 |

## 转换

```text
Idle -> Intention -> Active
Active -> Waiting -> Recovery? -> Return -> Active
Active -> Drift -> Return -> Active
Waiting -> Drift -> Return
Waiting -> Return (manual/adapter/simulation complete)
Return -> Review -> Active | Idle
Active -> Review -> Idle
任意活动态 -> Idle (明确放下/清空当前 session)
```

## 事件真实性

| 事件 | 第一版来源 | 能否真实检测 | 说明 |
|---|---|---|---|
| `wait_started` | 用户点击；模拟 adapter | **是（用户动作）** | 不声称知道外部 Agent 真的启动 |
| `checkpoint_saved` | 用户提交一行 | **是** | 只保存主动输入的最小上下文 |
| `drift_detected` | 用户点击；visibility 只能记录 `page_hidden` | **部分** | 页面隐藏不等于分心，不能自动判 Drift |
| `micro_action_selected` | 用户选择 | **是** | “留白”也是有效值 |
| `ai_completed` | 手动按钮、明确模拟计时、未来 adapter | **取决来源** | 事件必须带 `source` 与 `confidence`；模拟明确标注 |
| `return_prompted` | 墨流进入 Return | **是** | 不等于通知成功送达 |
| `return_confirmed` | 用户按“接回” | **是** | 核心成功事件之一 |
| `return_latency` | `return_promptedAt` 到 `returnConfirmedAt` | **是** | 如提示不可见，另记录 visibility |
| `context_recalled` | 用户自评完整/部分/未恢复 | **是（主观）** | 不伪装脑状态检测 |
| `session_closed` | 用户关闭/完成 | **是** | 带原因 complete/abandoned/changed |

## 数据模型（v1）

```ts
type FlowState =
  | "idle" | "intention" | "active" | "waiting"
  | "drift" | "return" | "recovery" | "review";

type AttentionMode = "ai" | "work" | "read" | "meditate";
type CompletionSource = "manual" | "simulation" | "adapter";

type FlowSession = {
  id: string;
  schemaVersion: 1;
  mode: AttentionMode;
  state: FlowState;
  intent: string;
  checkpoint: {
    lastAction?: string;
    nextAction: string;
    savedAt: number;
  } | null;
  wait: {
    source: CompletionSource;
    expectedSeconds?: number;
    startedAt: number;
    completedAt?: number;
    outcome?: "completed" | "failed" | "manual-return";
  } | null;
  returnPromptedAt?: number;
  returnConfirmedAt?: number;
  contextRecall?: "full" | "partial" | "lost" | "skipped";
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
};

type FlowEvent = {
  id: string;
  sessionId: string;
  type: string;
  at: number;
  source: "user" | "system" | "simulation" | "adapter";
  payload?: Record<string, string | number | boolean | null>;
};

type LocalProfile = {
  schemaVersion: 1;
  preferredMode?: AttentionMode;
  preferredMicroAction?: "blank" | "look" | "breathe" | "stretch" | "prompt";
  reminderPreference: "gentle" | "silent";
  reducedGuidance: boolean;
  recentReturnLatencyMs?: number;
};
```

## 检测边界

- `document.visibilityState` 只说明本页是否可见，不说明用户去了抖音、手机或另一项有效工作。
- 浏览器 title/DOM 变化只能在同源或扩展权限下观察；普通 Web App 不读取 Codex/Claude/Cursor 页面。
- Notification 权限不是核心依赖；拒绝后使用页面标题、声音可选和再次聚焦时的 Return。
- 多标签页通过 `storage` 事件或 `BroadcastChannel` 协调 session 版本；冲突时提示，不静默覆盖。

