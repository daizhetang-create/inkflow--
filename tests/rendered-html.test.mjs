import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", String(process.pid) + "-" + Date.now());
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost" + path, {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the complete Inkflow app shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /墨流/);
  assert.match(html, /INKFLOW/);
  assert.match(html, /把注意力，放回这一页/);
  assert.match(html, /开始沉浸/);
  assert.match(html, /墨流建议/);
  assert.match(html, /数据只留在本机/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/);
});

test("ships the MVP capabilities and offline shell", async () => {
  const [appSource, layoutSource, manifestSource, serviceWorker] = await Promise.all([
    readFile(new URL("app/FocusApp.tsx", projectRoot), "utf8"),
    readFile(new URL("app/layout.tsx", projectRoot), "utf8"),
    readFile(new URL("app/manifest.ts", projectRoot), "utf8"),
    readFile(new URL("public/sw.js", projectRoot), "utf8"),
  ]);

  assert.match(appSource, /localStorage\.setItem\("inkflow:sessions"/);
  assert.match(appSource, /AudioContext/);
  assert.match(appSource, /serviceWorker\.register/);
  assert.match(appSource, /data-testid="completion-modal"/);
  assert.match(appSource, /data-testid="start-break"/);
  assert.match(appSource, /role="dialog"/);
  assert.match(layoutSource, /og\.png/);
  assert.match(layoutSource, /x-forwarded-host/);
  assert.match(manifestSource, /display:\s*"standalone"/);
  assert.match(serviceWorker, /CACHE_NAME = "inkflow-v1"/);
  await access(new URL("public/og.png", projectRoot));
  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
});
