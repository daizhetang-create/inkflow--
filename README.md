# 墨流 Inkflow

墨流是一款日常注意力记录应用。它不要求用户先学会一套专注方法，也不把倒计时当作产品中心：写下此刻要做的事之后，用户可以在事情进行中一击记录走神、打断、念头和恢复，结束时留下结果与下一步，当天自动形成可读的注意力时间线。

## 当前产品闭环

1. 写一句“我现在要做什么”。
2. 选择当前状态；时间边界可以不设。
3. 进行中随时记录走神、打断、念头或进入九十秒恢复。
4. 散开后主动记录“我回来了”，不重新做计划。
5. 结束时选择完成、推进或暂停，并给未来的自己留一句话。
6. 在“今天”看见真实轨迹；记录满三天后，“规律”才会给出有证据的建议。

## 本地启动

```powershell
npm.cmd install
npm.cmd run dev
```

打开终端显示的本地地址，通常是 `http://localhost:3000/`。

## 质量检查

```powershell
npm.cmd run lint
npm.cmd test
```

`npm test` 会完成生产构建，并验证实时记录闭环、D1 持久化、身份隔离、PWA 离线壳、响应式与 legacy 恢复资产。

## 数据与身份

- 正式记录保存在 Cloudflare D1；`.openai/hosting.json` 使用 `DB` 绑定。
- 写入按平台转发的 `oai-authenticated-user-email` 隔离。
- 本地开发使用明确的 `local-preview` 身份。
- 浏览器只保存即时缓存与待同步队列；离线时可继续记录，联网后补传。
- 墨流不读取浏览历史、屏幕、Prompt 或其他应用，也不会根据页面隐藏擅自判断用户走神。

## 主要文件

- `app/AttentionApp.tsx`：当前完整产品与交互。
- `app/attention/store.ts`：离线缓存、补传队列与云端合并。
- `app/api/attention/route.ts`：D1 读写与所有者隔离。
- `db/schema.ts` / `drizzle/0000_flaky_medusa.sql`：正式数据结构与迁移。
- `docs/product/Z_daily_attention_rebuild.md`：从用户真实需求倒推的本轮产品定义。

## 旧版资产

`FocusApp.tsx`、`FlowApp.tsx`、`InkflowOpening.tsx` 和 `public/inkflow-opening/` 是可恢复的旧版本资产，但都不再是当前入口。不要把旧计时器或 Return Gate 的测试结论当作当前产品定义。
