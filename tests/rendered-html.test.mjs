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

test("ships local-first recovery, honest adapters, accessibility, and offline shell", async () => {
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
  assert.match(storage, /inkflow:vnext:snapshot/);
  assert.match(storage, /inkflow:vnext:events/);
  assert.doesNotMatch(storage, /removeItem\("inkflow:sessions"/);
  assert.match(app, /BroadcastChannel\("inkflow-vnext"\)/);
  assert.match(app, /Notification\.requestPermission\(\)/);
  assert.match(app, /NO SURVEILLANCE/);
  assert.match(app, /不会读取当前网页、代码或 Prompt/);
  assert.match(root, /DeterministicShell/);
  assert.match(machine, /Illegal Inkflow transition/);
  assert.match(layout, /og-vnext\.png/);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(serviceWorker, /CACHE_NAME = "inkflow-vnext-1"/);
  assert.match(stylesheet, /prefers-reduced-motion: reduce/);
  assert.match(stylesheet, /\.flow-line\.is-broken/);
  await access(new URL("public/og-vnext.png", projectRoot));
});
