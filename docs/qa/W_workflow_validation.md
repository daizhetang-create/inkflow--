# W｜工作流与回归验证

验证日期：2026-07-23

## 自动验证

- `npm run lint`：通过，0 error / 0 warning。
- `npm test`：构建通过；8 项 Node 测试全部通过。
- 状态机覆盖：标准闭环、主动漂移救援、非法转换、陈旧跨标签快照、事件来源。
- SSR 覆盖：确定性 Return Gate 壳、metadata、PWA、旧版可恢复资产。

## 真实浏览器路径 A：手动完成

1. 首次引导点击「开始第一条流」。
2. 输入 `让 AI 重构认证状态机`。
3. 输入回来第一步 `先跑 reducer 的失败路径测试`。
4. 手动封存、完成、接回、完成第一步。
5. Review 选择「完整接回」。
6. 历史中正确出现该动作与接回指标。

结果：整条闭环成功。

## 真实浏览器路径 B：模拟完成与刷新

1. 新建 `让 AI 生成发布说明`。
2. 回来第一步为 `只核对三条变更是否准确`。
3. 选择明确标注的「20 秒演示」。
4. 等待 1.6 秒后刷新页面。
5. 页面恢复 `CHECKPOINT SAVED` 和原动作。
6. 原目标时间到达后自动进入 `RETURN SIGNAL / SIMULATION`。

结果：刷新不重置模拟，来源标签正确。

## 真实缺陷与修复

第一次视觉取证发现开发环境 hydration mismatch。原因是服务端默认 profile 与客户端 localStorage、`Date.now()` 初始化不一致。修复为 `FlowRoot` 确定性服务端壳，挂载后才渲染 local-first 运行时。刷新复验后无 `UNHANDLED SCRIPT ERROR`，原快照仍正确恢复。

## 视觉证据

![Return Gate 桌面回归](../evidence/return-gate-desktop.png)

## 响应式证据

- CSS 覆盖 1050px 与 720px 两级布局；
- 720px 下左轨变底栏、Context Dock 上移、主表单和 Return Gate 单列；
- 测试环境的应用内浏览器没有暴露 viewport resize API，因此未伪造“真机截图”；上线前风险项记录在 Morning Report。
