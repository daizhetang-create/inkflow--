# S｜vNext 技术架构

## 1. 原则

1. local-first；工作正文默认不离开浏览器。
2. 状态机先于页面布尔值；规范化事件先于统计图。
3. 手动触发完整可靠；模拟能力始终标注来源。
4. adapter 可替换；主 UI 不依赖任何一家 Agent。
5. 后端、账号与数据库不是本轮内核，不搭空壳。

## 2. 实际模块

```text
app/FlowRoot.tsx               确定性 SSR 壳与客户端挂载边界
app/FlowApp.tsx                八状态 UI、浏览器能力与闭环编排
app/flow/machine.mjs           纯转换、不变量与规范化事件
app/flow/machine.d.ts          session/event 类型合同
app/flow/adapters.mjs          manual/simulation WaitAdapter
app/flow/storage.ts            schema v1 校验、迁移、快照、历史
app/globals.css                vNext 视觉、响应式、reduced-motion
public/sw.js                   network-first PWA 应用壳
tests/*.test.mjs               状态、存储、adapter、SSR、离线合同
```

UI 文件可以组合展示逻辑，但状态转换、adapter 与 storage 边界保持独立并可单测。

## 3. local-first 与恢复

- 存储键：`inkflow:vnext:snapshot`、`events`、`profile`、`history`。
- session/profile 使用 `schemaVersion: 1`；读取时校验关键字段。
- vNext 早期快照缺少新增字段时会安全补齐；损坏 JSON 或非法状态退回 Idle，不伪造历史。
- 当前 session 每次有意义转换写快照；事件最多保留 240 条；历史最多 30 条。
- 旧 `inkflow:sessions/settings/lastBook/lastGoal` 不读取、不修改、不删除。
- 清空入口仅枚举 `inkflow:vnext:*` 四个键。

## 4. 跨标签同步

- `BroadcastChannel("inkflow-vnext")` 只发送 `sessionId + revision`，不广播 checkpoint 正文。
- 接收方从同源 localStorage 重新校验快照，再比较 revision。
- 不支持 BroadcastChannel 时，`storage` 事件执行同一恢复路径。
- 陈旧 revision 不覆盖新状态；真实双标签浏览器回归已验证第二标签 Rejoin 后第一标签进入 Active。

## 5. WaitAdapter

统一接口包含：`id`、`honesty`、`label`、`schedulesCompletion`、`remaining(metadata)` 与 `completionEvent()`。

- `manual`：不设置定时器，只接受用户完成、失败或提前回来。
- `simulation`：20 秒或 5 分钟；只接收 `expectedAt` 元数据，刷新后重新计算剩余时间。
- 未知来源安全降级为 manual，不显示“已连接”。
- 未来 Codex/Claude/Cursor adapter 只有在事件可核验且用户明确授权后才能增加；默认不接收 checkpoint 正文。

## 6. 浏览器能力与降级

- `visibilitychange` 写 `PAGE_VISIBILITY`，但不自动进入 Drift。
- Return 状态将标题改为通用“任务有结果 · 墨流接回”，不暴露 checkpoint。
- 通知只在设置中由用户点击后申请；拒绝、不支持与静默偏好均持久化。
- 通知正文只说“回来接回刚才封存的第一步”，不含工作内容。
- `prefers-reduced-motion` 将动画压缩到近零，状态仍由形态与文字表达。

## 7. PWA 与离线

- cache：`inkflow-vnext-v2`。
- 预缓存 `/`、manifest 与 `og-vnext.png`；不缓存旧版 19MB 开场视频。
- navigation 使用 network-first，失败后返回缓存的 `/`。
- 只缓存成功的同源 GET；Service Worker 不持有 session 或通知正文。
- 离线测试用真实拒绝网络的 fetch handler 验证缓存 shell 返回 200。

## 8. 隐私与安全

- 无 analytics SDK、无云上传、无账号要求。
- 输入限长，React 纯文本渲染；不存在 `dangerouslySetInnerHTML`。
- 不请求麦克风、摄像头、系统使用情况或跨站读取权限。
- auth helper 与空数据库资产保留但不进入运行路径。
- BroadcastChannel、adapter、通知均不传 checkpoint 正文。

## 9. 验证策略

- 状态机：八状态闭环、20 秒/5 分钟、失败、提前回来、无人返回、漂移、visibility、非法转换、陈旧 revision。
- storage：schema、迁移、损坏恢复、通知拒绝、静默/低能量、只清 vNext。
- adapter：manual 不伪造定时、simulation 按持久化元数据恢复、未知来源降级。
- SSR/PWA：确定性壳、metadata、manifest、视觉合同、离线应用壳。
- 浏览器：Recovery 刷新恢复、5 分钟模拟、失败 Return、多标签同步、390×844 真正 Chromium 视口。
