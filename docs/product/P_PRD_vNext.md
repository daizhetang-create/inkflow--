# P — 墨流 vNext PRD

## 产品一句话

**墨流是一道注意力回流门：离开前封存下一步，AI 完成后把你接回原任务。**

## 第一用户与第一场景

- 第一用户：高频使用 Agent 做 Web/Vibe Coding 的个人创造者。
- 第一场景：用户发出一个 20 秒–5 分钟的 Agent 任务，不想在等待中被手机/网页带走。
- 上位问题：人在异步中断后丢失上下文，现有工具只提醒“完成”，不帮助“接管”。

## 核心机制与循环

- Return Packet：`intent + lastAction? + nextAction + source + timestamps`。
- 核心循环：`选择去向 → 封存下一步 → 等待/恢复/留白 → 完成信号 → 接回 → 第一动作 → 轻复盘`。
- 最小不可删除动作：把回来后的第一步封存，再把它一击接回。

## 主流程

1. 首次进入，10 秒内看到“AI 在生成时，先留下回来后的第一步”。
2. 选择 AI 工作、普通工作、阅读或冥想；默认 AI。
3. 输入当前目的（可短）与回来后的第一步（必填，≤120 字）。
4. 选择可靠手动模式或明确标注的 20 秒/5 分钟模拟，保存 checkpoint。
5. 进入 Waiting；选择留白或一次微行动，不出现 feed。
6. 手动/模拟完成后进入 Return；页面重新聚焦时也能显示等待完成。
7. 显示 checkpoint，用户按“接回这一步”。
8. 用户完成或准备好第一动作后选择“上下文完整/部分/没回来/跳过”。
9. 显示一条轻反馈和“继续真实任务”，墨流退回 Active/Idle。

## 异常流程

- AI/任务失败：标记 outcome=failed，仍呈现原意图和“先判断失败与目标的关系”。
- 提前回来：用户随时手动结束间隙并接回。
- 没有回来：checkpoint 持久化；下次访问提供 respawn，不惩罚。
- 页面刷新/离线：从 localStorage 恢复当前 session；Service Worker 提供应用壳。
- 多标签页：BroadcastChannel/storage 同步版本，旧标签提示“另一页已更新”。
- 通知不支持/拒绝：页面标题、可选轻声和再次聚焦时提示；核心闭环不依赖通知。
- 不想被提醒：silent preference，完成后只在用户回到页面时呈现。
- 页面隐藏：记录 `page_hidden`，不自动判定 drift。

## MVP 边界

### 本轮实现

- 显式状态机与版本化 local-first 数据。
- manual adapter 与清晰 simulation adapter。
- AI / 工作 / 阅读 / 冥想四种同核文案迁移。
- checkpoint、等待、微行动/留白、完成、回流、轻复盘。
- Drift Rescue 入口、刷新恢复、多标签页基础协调、通知降级。
- 最近节律记忆：最近模式、微行动、一次回流延迟；可关闭/清空。

### 非目标

- 不读取 Codex/Claude/Cursor 内容，不伪装完成检测。
- 不建账号、D1、云同步、团队协作或跨设备。
- 不做长期统计 Dashboard、积分、等级、streak、排行榜。
- 不做聊天式 AI 教练、Prompt 管理器、任务管理器或网站屏蔽器。
- 不做医疗诊断或治疗。
- 旧计时、声景、阅读页数和 12 秒开场不进入主流程。

## Adapter

```ts
export interface WaitAdapter {
  id: "manual" | "simulation" | string;
  label: string;
  honesty: "manual" | "simulated" | "connected";
  start(input: { sessionId: string; expectedSeconds?: number }): Promise<void>;
  cancel(): Promise<void>;
  subscribe(listener: (event: {
    type: "completed" | "failed" | "progress";
    at: number;
    detail?: string;
  }) => void): () => void;
}
```

## 隐私

- 默认仅浏览器 localStorage；无 D1/R2、无账号。
- 不自动采集 Prompt、代码、Agent 输出、URL 历史或应用使用情况。
- checkpoint 由用户主动输入，界面常驻“只在本机”。
- 一键清空全部 vNext 数据；旧 v0.1 数据不自动合并。
- 事件只含状态与时间，不上传。

## 成功指标

- 核心：`return_confirmed / return_prompted` 回流成功率。
- 回流延迟中位数与 P75。
- `context_recalled=full|partial` 比例。
- checkpoint 完成率与 30 秒首次闭环完成率。
- 间隙中选择留白/微行动的主动比例。
- 次日是否再次主动开始 session。
- 访谈中是否自然说出“它把我接回来了”。

## 失败指标

- 首次用户把产品称为“番茄钟/冥想/待办”。
- checkpoint 输入中位时间 >15 秒或跳过率 >35%。
- 回流提示被 ≥30% 用户评价为烦。
- 使用后仍需重读大量上下文，主观恢复无改善。
- 用户为了数字停留在墨流、产生断签焦虑或误以为外部 AI 已真实集成。

## 未来扩展

1. 浏览器扩展/桌面 sidecar 与全局快捷键。
2. Codex/Claude Code/Cursor adapter，事件必须可验证来源。
3. 多 Agent 河口与优先接管。
4. 端到端加密的可选跨设备 relay。
5. 基于本机数据的个体节律建议，不上传工作内容。

## 与旧版关系

v0.1.0 是可恢复的 legacy 阅读计时器和品牌影片；vNext 复用构建、local-first 和降级工程经验，否定时间圆环、阅读统计、规则“智能”、声景与 Dashboard 作为产品中心。

