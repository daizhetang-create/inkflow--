# S — vNext 技术架构

## 原则

1. local-first；工作正文默认不离开浏览器。
2. 状态机先于页面布尔值；事件先于统计图。
3. 手动触发完整可靠，模拟与自动能力显式标注。
4. adapter 可替换；主 UI 不依赖任何一家 Agent。
5. 不为“完整”搭空后端；本轮 D1/R2 保持未绑定。

## 模块

```text
app/FlowApp.tsx                 组合状态 UI
app/flow/types.ts               状态、session、event、profile 类型
app/flow/reducer.ts             纯状态转换与不变量
app/flow/storage.ts             schema v1、解析、恢复、清空
app/flow/adapters.ts            WaitAdapter + manual/simulation
app/flow/useFlowRuntime.ts      计时、visibility、通知、BroadcastChannel
app/flow/content.ts             四场景文案与微行动
app/globals.css                 vNext 视觉系统
tests/flow-reducer.test.mjs     转换与异常
tests/vnext-contract.test.mjs   隐私/诚实/渲染契约
```

最终可根据实现复杂度合并文件，但 reducer/storage/adapter 的边界必须保留。

## 状态与事件持久化

- Key：`inkflow:vnext:snapshot`、`inkflow:vnext:events`、`inkflow:vnext:profile`。
- `schemaVersion: 1`；读取时逐字段校验，失败则安全回到 Idle 并保留“清理损坏数据”入口。
- 当前 session 每次有意义转换写快照；事件环形保留最近 200 条，避免无限增长。
- 旧 `inkflow:sessions/settings/lastBook/lastGoal` 不读取、不删除，以便 legacy 恢复。
- `BroadcastChannel("inkflow-vnext")`；不可用时使用 `storage` 事件。消息只传 revision/sessionId，不传额外正文。

## Adapter 设计

- `manual`：start 只进入 Waiting；用户显式 complete/fail/cancel。
- `simulation`：可选 20 秒或 5 分钟；`setTimeout` 只模拟完成信号，UI 常驻“模拟”。刷新后按 `startedAt + expectedSeconds` 计算，不依赖存活 timer。
- 未来 adapter：Codex/Claude/Cursor/扩展需提供可核验事件与来源；界面只有在 `honesty="connected"` 时显示“已连接”。
- adapter 不接收 checkpoint 正文，除非未来用户显式授权；默认只接 sessionId。

## 通知与浏览器能力

- 首版不主动请求通知。设置中用户触发后才调用 `Notification.requestPermission()`。
- granted：完成时通知任务标题和通用“回来继续”，默认不放 nextAction 以防锁屏泄露；用户可选择允许。
- denied/unavailable：标题变化 + 页面再次聚焦 Return。
- `visibilitychange` 记录可见性；不读取浏览历史、不判断手机使用。

## Service Worker

- 升级 cache 为 `inkflow-vnext-v1`。
- 缓存应用壳和必要静态资产；旧 19MB 开场媒体不预缓存。
- navigation 采用 network-first + cached shell；静态资源只缓存成功同源 GET。
- 不在 SW 中保存 session 内容或通知 payload。

## 隐私与安全

- 不上传 checkpoint、事件或 profile；无 analytics SDK。
- 限长与纯文本渲染，React 默认转义，禁止 `dangerouslySetInnerHTML`。
- 不请求麦克风、摄像头、系统使用情况或跨站读取权限。
- 清空功能只删除三个 `inkflow:vnext:*` key，不触碰 legacy/user 文件。
- auth helper 保留未调用；匿名可用是 MVP 原则。

## 测试策略

- reducer 表驱动测试覆盖所有状态/事件合法与非法转换。
- fake clock 覆盖 20 秒/5 分钟、刷新后超时、提前回来、失败。
- DOM 合同验证真实文案、模拟标识、隐私声明、无旧计时/阅读 Dashboard。
- 手工浏览器矩阵覆盖通知拒绝/不支持、离线、多标签页、移动端、reduced-motion、低能量。

