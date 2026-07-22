# START HERE｜墨流 vNext

## 本地启动

```powershell
npm.cmd install
npm.cmd run dev
```

打开 `http://localhost:3000`。

## 质量检查

```powershell
npm.cmd run lint
npm.cmd test
```

## 产品最短路径

选择 AI 任务 → 写正在等待什么 → 写回来第一步 → 选择手动或模拟 → 封存 → 完成 → 接回 → 完成第一步 → Review。

## 数据与隐私

所有新版数据使用 `inkflow:vnext:*` 保存在当前浏览器；清除 vNext 数据不会触碰旧版 `inkflow:sessions` 或设置。

## 旧版恢复

旧版主线基点为 `bb684f9`。不要删除 `FocusApp.tsx`、`InkflowOpening.tsx` 或 `public/inkflow-opening/`；它们是可恢复资产，不是新版入口。
