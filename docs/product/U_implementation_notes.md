# U｜vNext 实现说明

## 已交付闭环

墨流 vNext 现在可以完整完成：首次进入 → 选择场景 → 写下任务与回来第一步 → 手动/模拟等待 → 真实 Recovery 脑间歇 → 完成/失败信号 → 一击接回 → 完成第一步 → 恢复质量复盘 → 本地历史。

辅助闭环：用户主动点击「我飘走了」→ 确认目的是否改变 → 把动作缩小到两分钟内可开始 → 返回 Return Gate。

## 实现边界

- `app/FlowRoot.tsx`：确定性的服务端外壳，避免 localStorage 与 SSR hydration 冲突。
- `app/FlowApp.tsx`：正式交互与状态 UI。
- `app/flow/machine.mjs`：八状态纯状态机，非法转换会明确抛错。
- `app/flow/adapters.mjs`：可替换 manual/simulation WaitAdapter；未知来源安全降级。
- `app/flow/storage.ts`：独立 `inkflow:vnext:*` 命名空间、历史和清除逻辑。
- `public/sw.js`：vNext PWA 壳；应用运行时主动注册。
- 旧 `FocusApp.tsx`、`InkflowOpening.tsx` 与三段批准素材保留但不进入主路径。

## 诚实性

- 首版没有假装接入 AI 平台；完成信号清楚标成「手动」或「模拟」。
- 不读取当前网页、Prompt、代码、浏览历史或键盘行为。
- `visibilitychange` 不被当作漂移证据。
- 通知只在设置中由用户点击后申请；拒绝后不阻断核心流程。

## 韧性

- 刷新后从本地快照恢复等待及模拟目标时间；计时不是重新开始。
- BroadcastChannel 只广播 sessionId/revision，并以 storage 事件降级；较旧 revision 不覆盖较新状态。
- schema v1 校验损坏快照；通知拒绝、静默与低能量偏好均可恢复。
- 服务端只输出稳定壳，浏览器挂载后才读取设备数据。
- PWA 导航采用 network-first，离线回退应用壳。
