import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("delivers every A–Y artifact at the required path", async () => {
  const required = [
    "docs/rebuild/A_current_audit.md",
    "docs/rebuild/B_restore.md",
    "docs/rebuild/C_failure_diagnosis.md",
    "docs/research/D_world_scan.md",
    "docs/research/E_transfer_cards.md",
    "docs/strategy/F_problem_frame.md",
    "docs/strategy/G_concept_universe.md",
    "docs/strategy/H_candidate_hypotheses.md",
    "docs/strategy/I_narrow_door_matrix.md",
    "docs/product/J_jtbd.md",
    "docs/product/K_kernel.md",
    "docs/product/L_behavior_loop.md",
    "docs/product/M_state_machine.md",
    "docs/strategy/N_brand_semantics.md",
    "docs/strategy/O_opportunity.md",
    "docs/product/P_PRD_vNext.md",
    "docs/product/Q_quality_bar.md",
    "docs/product/R_experience_architecture.md",
    "docs/technical/S_architecture.md",
    "docs/prototypes/T_prototype_evaluation.md",
    "docs/product/U_implementation_notes.md",
    "docs/product/V_visual_system.md",
    "docs/qa/W_workflow_validation.md",
    "docs/validation/X_experiment_plan.md",
    "docs/delivery/Y_delivery_manifest.md",
    "FOUNDER_MORNING_REPORT.md",
    "START_HERE.md",
    "CHANGELOG_vNEXT.md",
  ];
  await Promise.all(required.map((path) => access(new URL(path, root))));
  await assert.rejects(access(new URL("docs/experiments/X_experiment_plan.md", root)));
});

test("morning report follows the exact ten-section contract", async () => {
  const report = await readFile(new URL("FOUNDER_MORNING_REPORT.md", root), "utf8");
  const headings = [...report.matchAll(/^## (\d+)\. (.+)$/gm)].map((match) => `${match[1]}. ${match[2]}`);
  assert.deepEqual(headings, [
    "1. 一夜之后，墨流变成了什么",
    "2. 我们推翻了什么",
    "3. 我们从世界学到了什么",
    "4. 我们选择了什么",
    "5. 产品如何工作",
    "6. 最有辨识度的一刻",
    "7. 真实完成情况",
    "8. 我应该先看哪里",
    "9. 仍未解决的问题",
    "10. 明天最值得做的三件事",
  ]);
  const summary = report.match(/## 1\.[^\n]+\n\n([^\n]+)/)?.[1] ?? "";
  assert.ok([...summary].length <= 40, `Section 1 must be <= 40 characters, got ${[...summary].length}`);
});

test("research and workflow manifests prove the mandated breadth", async () => {
  const [world, cards, workflows] = await Promise.all([
    readFile(new URL("docs/research/D_world_scan.md", root), "utf8"),
    readFile(new URL("docs/research/E_transfer_cards.md", root), "utf8"),
    readFile(new URL("docs/qa/W_workflow_validation.md", root), "utf8"),
  ]);
  assert.match(world, /18 个领域，40 个机制/);
  assert.equal([...cards.matchAll(/^## \d{2}\./gm)].length, 20);
  for (const scenario of [
    "首次用户", "已有用户", "AI 任务 20 秒完成", "AI 任务 5 分钟完成", "AI 失败",
    "用户提前回来", "用户没有回来", "用户切换到抖音/网页", "浏览器不支持通知", "用户拒绝权限",
    "离线", "页面刷新", "多标签页", "移动端", "低能量模式", "不想被提醒", "只想留白",
    "阅读模式", "冥想模式", "工作模式",
  ]) assert.match(workflows, new RegExp(`\\| ${scenario} \\|`));
});
