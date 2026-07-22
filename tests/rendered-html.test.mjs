import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html", host: "localhost" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders a deterministic Inkflow Return Gate shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /RETURN GATE \/ LOADING/);
  assert.match(html, /回来后的第一步/);
  assert.match(html, /LOCAL FIRST/);
  assert.match(html, /正在接回这台设备上的本地快照/);
  assert.doesNotMatch(html, /开始沉浸|把注意力，放回这一页|Your site is taking shape/);
});

test("ships the eight-state, local-first, source-honest recovery runtime", async () => {
  const [app, root, storage, machine, layout, manifest, serviceWorker, stylesheet] = await Promise.all([
    readFile(new URL("app/FlowApp.tsx", projectRoot), "utf8"),
    readFile(new URL("app/FlowRoot.tsx", projectRoot), "utf8"),
    readFile(new URL("app/flow/storage.ts", projectRoot), "utf8"),
    readFile(new URL("app/flow/machine.mjs", projectRoot), "utf8"),
    readFile(new URL("app/layout.tsx", projectRoot), "utf8"),
    readFile(new URL("app/manifest.ts", projectRoot), "utf8"),
    readFile(new URL("public/sw.js", projectRoot), "utf8"),
    readFile(new URL("app/globals.css", projectRoot), "utf8"),
  ]);
  assert.match(storage, /schemaVersion:\s*1/);
  assert.match(storage, /isFlowSession/);
  assert.match(storage, /inkflow:vnext:snapshot/);
  assert.match(storage, /inkflow:vnext:events/);
  assert.doesNotMatch(storage, /removeItem\("inkflow:sessions"/);
  assert.match(app, /BroadcastChannel\("inkflow-vnext"\)/);
  assert.match(app, /window\.addEventListener\("storage"/);
  assert.match(app, /sessionId: after\.id, revision: after\.revision/);
  assert.doesNotMatch(app, /postMessage\(\{ session: after/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /PAGE_VISIBILITY/);
  assert.match(app, /Notification\.requestPermission\(\)/);
  assert.match(app, /notificationDecision === "denied"/);
  assert.match(app, /回来接回刚才封存的第一步/);
  assert.doesNotMatch(app, /new Notification[^\n]+session\.nextAction/);
  assert.match(app, /SIGNAL_FAILED/);
  assert.match(app, /session\.stage === "recovery"/);
  assert.match(app, /NO SURVEILLANCE/);
  assert.match(app, /不会读取当前网页、代码或 Prompt/);
  assert.match(root, /DeterministicShell/);
  assert.match(machine, /"recovery"/);
  assert.match(machine, /micro_action_selected/);
  assert.match(machine, /session_closed/);
  assert.match(machine, /Illegal Inkflow transition/);
  assert.match(layout, /og-vnext\.png/);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(serviceWorker, /CACHE_NAME = "inkflow-vnext-v2"/);
  assert.match(stylesheet, /prefers-reduced-motion: reduce/);
  assert.match(stylesheet, /\.flow-line\.is-broken/);
  assert.match(stylesheet, /\.recovery-focus/);
  assert.match(stylesheet, /@media \(max-width: 720px\)/);
  await access(new URL("public/og-vnext.png", projectRoot));
});
