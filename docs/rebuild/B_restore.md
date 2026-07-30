# B — 旧版保护与恢复

## 安全基线

- 旧版基线：`bb684f9`。
- 原主分支：`main`，在重构开始时相对 `origin/main` 超前 1 个本地提交。
- 重构分支：`codex/rebuild-inkflow-next`，从 `bb684f9` 创建。
- 未移动、未删除 `design/`、`video/`、旧媒体、托管配置或任何用户文件。

## 恢复方式

查看旧版而不破坏当前工作：

```powershell
git worktree add ..\readflow-legacy bb684f9
```

回到旧版主分支：

```powershell
git switch main
```

若重构分支尚未合并，删除它不会影响 `main`；但在完整验收前不执行删除。

## 假设记录

1. vNext 的第一用户是高频使用 Codex/Claude Code/Cursor/Agent 的个人创造者，待研究评分后确认或推翻。
2. 第一版以浏览器内手动触发为可靠基线，不声称能检测所有 Agent 状态。
3. 默认 local-first，不引入账号、D1 或云同步，除非核心验证证明它们不可缺。
4. 已批准开场媒体作为品牌档案保留，但不允许牺牲 30 秒首次核心体验。
5. 公开发布只在本地构建、关键流程与隐私表述验证通过后进行。

