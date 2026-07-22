# A — 旧版完整审计

审计时间：2026-07-23  
审计基线：`bb684f9`（v0.1.0 阅读计时器 + 已批准开场动画）

## 结论

当前版本技术上是一个能构建、能离线打开、能完成阅读计时闭环的 PWA；产品上却仍是“阅读番茄钟 + 声景 + 休息 + 统计 + 规则文案”的集合。它没有处理 AI 协作时代真正新增的中断问题，也没有一个删掉计时器之后仍成立的核心动作。

## 目录、技术栈与构建

- `app/page.tsx`：仅把 `FocusApp` 包进 `InkflowOpening`，没有路由级信息架构。
- `app/FocusApp.tsx`：1,040 行单体客户端组件，承载计时、音频、设置、记录、建议、弹窗和全部页面结构。
- `app/globals.css`：1,976 行全局样式；暖纸/墨绿双主题、圆环、卡片、侧栏、底部栏与 9 组动画集中在同一文件。
- `app/InkflowOpening.tsx`：明确的五态开场状态机；12 秒主片、3 秒点击转场、会话内只展示一次、降级和 reduced-motion 已实现。
- `app/layout.tsx`、`app/manifest.ts`：元数据与 PWA 定义仍把产品锁定为“深度阅读计时器”。
- `public/sw.js`：简单 cache-first 应用壳和 navigation fallback；缓存版本仍为 `inkflow-v1`。
- `db/schema.ts`：空 Schema。`db/index.ts` 只有未被主流程调用的 D1 工厂。
- `app/chatgpt-auth.ts`：安全的身份 header 辅助，但没有任何产品页面调用。
- `worker/index.ts`：标准 vinext / Cloudflare Worker 入口及图片优化代理。
- `.openai/hosting.json`：已有 Sites 项目 ID，无 D1、R2。
- 运行：Node `>=22.13.0`，React 19、Next 16、Vinext/Vite、Cloudflare Worker；`npm run dev`、`npm run build`、`npm test`、`npm run lint`。

## 当前真实可运行功能

1. 输入书名与单轮阅读意图。
2. 20/35/50 分钟预设或 10–90 分钟步进设置。
3. 基于目标时间戳的计时，支持暂停、恢复、提前结束和空格键。
4. Web Audio 程序化生成细雨、溪影、夜车三种声景，另有静音。
5. 完成后填写页数和 2–5 状态，进入 3/5/8 分钟脑间歇。
6. `localStorage` 保存设置、最近书名/目标和阅读记录。
7. 当日分钟、轮次、页数和七日墨点统计。
8. PWA manifest、Service Worker 与离线导航壳。
9. 开场动画具备加载失败、自动播放失败、减少动态效果、焦点与滚动锁定降级。

## 数据流与隐含状态机

`FocusApp` 的真实状态只有 `setup → focus → break → setup`。计时状态又由 `isRunning` 叠加，完成/结束/设置由三个布尔弹窗叠加，因此不是一个可验证的领域状态机。

本地数据：

- `inkflow:settings`：`breakMinutes`、`volume`、`soundscape`、`theme`。
- `inkflow:sessions`：`id/date/minutes/pages/feeling/book`。
- `inkflow:lastBook`、`inkflow:lastGoal`。
- `inkflow:opening-complete`：仅 sessionStorage。

没有 session event、checkpoint、waiting、drift、return、return latency 或 context recall 数据，也没有跨标签页协调和版本迁移。

## 视觉资产与阅读绑定点

- `public/inkflow-opening/*`：约 19 MB 视频/终帧，视觉质量高但语义是“进入墨圈”，不表达回流机制；可保留为品牌档案，vNext 首次体验不应被 12 秒不可跳过前置内容阻断。
- `public/og.png`：约 2.5 MB，仍宣传阅读计时器。
- `public/favicon.svg`、书本圆环、墨点、暖纸、墨绿、阅读页数、书名、阅读节律、脑间歇等，均强绑定旧定义。
- UI 由一个大计时圆环、三张伴随卡、统计、声景与设置组成，典型效率 Dashboard 层级。

## 可复用资产

1. 基于绝对截止时间的计时实现，刷新前的运行准确性优于简单递减。
2. local-first 与不上传用户工作内容的隐私立场。
3. `InkflowOpening` 中明确状态、autoplay/load 降级、reduced-motion、焦点/滚动锁定的工程模式；媒体本身只归档，不作为 vNext 核心。
4. Cloudflare Worker/Vinext/Sites 构建与部署骨架。
5. Web Audio 的安全启动/停止和资源清理代码，可作为可选恢复模块而非核心功能。

## 伪智能、伪后端与占位逻辑

- `smartAdvice` 只检查当前小时、当日分钟和轮次，返回五组写死文案；“适时生成”会被理解为 AI 能力，实际上既无模型、无个性学习，也无行为反馈。
- `db/schema.ts` 明确为空，D1 未绑定；任何“云端记录”都不存在。
- `chatgpt-auth.ts` 未接入，页面实际匿名。
- 统计只统计阅读分钟/页数，不能说明理解、恢复或注意力连续性。
- 建议按钮最多把下一轮改为 20 分钟；没有真实建议闭环。

## 响应式、无障碍与交互问题

- 有响应式断点、44px 目标、focus-visible、aria-live 和 reduced-motion，这是基础优点。
- 设置/完成/停止三个 dialog 没有焦点圈定、Escape 关闭和返回触发点；屏幕阅读器与键盘用户可能移动到背景。
- `mobile-dock` 只是滚动到同页区块，移动端仍是桌面 Dashboard 的纵向堆叠，不是独立伴随体验。
- 动态文档标题只呈现倒计时，没有完成/回流语义；没有 Notification API 降级策略。
- 没有 `visibilitychange`、页面离开/回到、`storage` 或 `BroadcastChannel` 协调，无法处理真正的偏航和多标签页。

## 性能、隐私与安全

- 首次会话自动预加载约 17 MB 视频并展示 12 秒开场，对 10 秒理解和 30 秒首次价值形成直接冲突。
- 大型单体组件和全局 CSS 增加修改风险，但运行时复杂度尚可。
- Service Worker 对同源 GET 广泛 cache-first，缺少响应类型、容量与版本化数据迁移策略。
- 工作内容当前仅本地，隐私方向正确；但 localStorage 没有 schema/version/过期与损坏迁移。
- auth helper 对 return path 做了同源限制，代码本身安全；未使用，因此也未带来产品价值。

## 为什么只是漂亮壳子 / 功能拼盘

首屏最突出的对象是时间圆环，右侧依次是“建议、统计、休息”，底部是声景与设置。每个模块都能在任一番茄钟中独立存在，模块之间只有计时完成这个弱连接。开场、墨色和文案提高了包装完整度，却没有改变用户动作、系统反馈或成功单位；用户仍以“开始一段时间—熬到结束—看分钟数”理解产品。

## 去留决定

- 保留到 Git 历史：完整 v0.1.0、开场媒体、旧 OG、旧阅读 UI。
- 直接复用：构建/部署骨架、local-first 原则、计时底层、降级与无障碍工程模式。
- 重写：主组件、状态模型、数据模型、元数据、manifest、Service Worker 缓存版本、测试与全部产品文案。
- 不进入 vNext 核心：书名/页数、阅读时长统计、声景、主题选择、建议卡、七日墨点、前置开场动画。

