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

test("preserves the approved v0.1 opening media as a recoverable legacy asset", async () => {
  for (const [path, bytes, sha256] of mediaContract) {
    const url = new URL(path, projectRoot);
    const [details, contents] = await Promise.all([stat(url), readFile(url)]);
    assert.equal(details.size, bytes, `${path} byte size`);
    assert.equal(createHash("sha256").update(contents).digest("hex").toUpperCase(), sha256, `${path} sha256`);
  }
});

test("vNext starts at a deterministic Return Gate shell while retaining legacy code", async () => {
  const [page, root, opening, focus, serviceWorker] = await Promise.all([
    readFile(new URL("app/page.tsx", projectRoot), "utf8"),
    readFile(new URL("app/FlowRoot.tsx", projectRoot), "utf8"),
    readFile(new URL("app/InkflowOpening.tsx", projectRoot), "utf8"),
    readFile(new URL("app/FocusApp.tsx", projectRoot), "utf8"),
    readFile(new URL("public/sw.js", projectRoot), "utf8"),
  ]);
  assert.match(page, /<FlowRoot\s*\/>/);
  assert.doesNotMatch(page, /InkflowOpening|FocusApp/);
  assert.match(root, /useSyncExternalStore/);
  assert.match(root, /<FlowApp\s*\/>/);
  assert.match(opening, /inkflow:opening-complete/);
  assert.match(focus, /inkflow:sessions/);
  assert.match(serviceWorker, /inkflow-vnext-v2/);
  assert.doesNotMatch(serviceWorker, /inkflow-opening/);
});
