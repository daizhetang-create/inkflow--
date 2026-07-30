# START HERE｜墨流 0.3

## 先看产品

```powershell
npm.cmd run dev
```

首页真正的最短路径是：

`写一句此刻要做什么 → 开始记录 → 一击留下走神/打断/回来 → 结束这一段 → 看见今天`

计时是辅助信息，不是产品主流程。

## 再做验证

```powershell
npm.cmd run lint
npm.cmd test
```

## 接手前必须知道

- 当前产品定义见 `docs/product/Z_daily_attention_rebuild.md`。
- 当前入口是 `app/page.tsx → AttentionRoot → AttentionApp`。
- 正式数据使用 D1，浏览器仅作离线缓存和补传队列。
- 旧阅读计时器、开场动画与 Return Gate 都保留为 legacy，不要恢复为主入口。
