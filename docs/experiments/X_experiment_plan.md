# X｜首轮实验计划

## 北极星

不是专注分钟，而是 **Return Confirmed Rate**：创建 checkpoint 的会话里，用户是否点击接回并完成恢复质量反馈。

## 指标

| 指标 | 定义 | 首轮目标 |
| --- | --- | ---: |
| Checkpoint completion | 开始填写后成功封存 | ≥ 65% |
| Return confirmed | 已完成空档中点击接回 | ≥ 55% |
| Median return latency | 信号至接回点击 | ≤ 12 秒 |
| First-step completion | 接回后完成第一步 | ≥ 40% |
| Clear/complete review | Review 选完整或部分 | ≥ 70% |
| 7-day repeated return | 7 日内完成 3 次接回 | ≥ 20% |

## 实验 01：Return Copy

- A：回来第一步
- B：接回这一小步
- 观察：封存率、接回时延；不使用停留时长做胜负。

## 实验 02：Micro-break 默认值

- A：只留白
- B：看远处
- 观察：Return Confirmed、Review 完整度；按场景分层。

## 实验 03：低能量模式

- 对主动开启用户只减少信息，不改闭环。
- 观察：接回率、跳过 Review 比例、定性访谈。

## 质性研究

招募 8 位一周使用 AI Web / Vibe Coding ≥ 4 天的个人创作者。回放一次真实等待，不问“喜欢 UI 吗”，只问：

1. 你离开前脑中最后一个未完成动作是什么？
2. 回来后先看了哪里？
3. 哪句话让你不用重建上下文？
4. 哪个步骤像额外工作？

## 守门条件

如果 20 次真实空档中低于 8 次完成接回，不增加排行榜、连续签到、AI 聊天或更多场景；先削短 checkpoint 和 Return。
