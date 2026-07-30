import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);
const mediaContract = [
  ["public/inkflow-opening/intro.mp4", 16_105_974, "0AC9B744C9DAE20F322786EC8808039E496E964737170021A48B0FBE920F5C40"],
  ["public/inkflow-opening/click-transition.mp4", 875_451, "7AA44FBE31EE5053C55A4847D9F4A9DBCACC034B4D24481DA0308D6F08721365"],
  ["public/inkflow-opening/end-frame.png", 2_030_262, "CC8CFFAEF72109E01F95C38759D5EF90313AD81ABFFB144AFBFE883C6EE8EE1F"],
];

test("preserves approved opening and previous product versions as recoverable assets", async () => {
  for (const [path, bytes, sha256] of mediaContract) {
    const url = new URL(path, projectRoot);
    const [details, contents] = await Promise.all([stat(url), readFile(url)]);
    assert.equal(details.size, bytes, `${path} byte size`);
    assert.equal(createHash("sha256").update(contents).digest("hex").toUpperCase(), sha256, `${path} sha256`);
  }
  await Promise.all([
    stat(new URL("app/FocusApp.tsx", projectRoot)),
    stat(new URL("app/FlowApp.tsx", projectRoot)),
    stat(new URL("app/InkflowOpening.tsx", projectRoot)),
  ]);
});

test("the default entry is daily time planning while one-touch attention remains an experiment", async () => {
  const [page, root, app, planner] = await Promise.all([
    readFile(new URL("app/page.tsx", projectRoot), "utf8"),
    readFile(new URL("app/AttentionRoot.tsx", projectRoot), "utf8"),
    readFile(new URL("app/AttentionApp.tsx", projectRoot), "utf8"),
    readFile(new URL("app/planner/PlannerView.tsx", projectRoot), "utf8"),
  ]);
  assert.match(page, /<AttentionRoot viewer=\{viewer\}/);
  assert.match(page, /getChatGPTUser/);
  assert.doesNotMatch(page, /FlowRoot|FocusApp|InkflowOpening/);
  assert.match(root, /今天，[\s\S]*准备从哪一段开始/);
  assert.match(root, /useSyncExternalStore/);
  assert.match(app, /useState<View>\("plan"\)/);
  assert.match(app, /<PlannerView viewer=\{viewer\}/);
  assert.match(app, /<span>计划<\/span>/);
  assert.match(app, /<span>专注<\/span>/);
  assert.match(planner, /安排一段/);
  assert.match(planner, /开始这件事/);
  assert.match(planner, /暂停/);
  assert.match(planner, /完成/);
  assert.match(planner, /超时/);
  assert.match(app, /一键开始记录/);
  assert.match(app, /我回来了/);
  assert.match(app, /顺手记下/);
  assert.doesNotMatch(app, /RETURN GATE|开始沉浸|番茄|开始前的状态|时间边界/);
});
