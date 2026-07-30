import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("ships a one-touch daily attention loop instead of a setup form", async () => {
  const [app, root, store] = await Promise.all([
    readFile(new URL("app/AttentionApp.tsx", projectRoot), "utf8"),
    readFile(new URL("app/AttentionRoot.tsx", projectRoot), "utf8"),
    readFile(new URL("app/attention/store.ts", projectRoot), "utf8"),
  ]);
  assert.match(root, /正在接回今天的记录/);
  assert.match(app, /不填、不选，也能留下这一刻/);
  assert.match(app, /一键开始记录/);
  assert.match(app, /我回来了/);
  assert.match(app, /recordReturnPulse/);
  assert.match(app, /被打断/);
  assert.match(app, /留个念头/);
  assert.match(app, /缓一下/);
  assert.match(app, /收好这一段/);
  assert.match(app, /默认不设时限/);
  assert.match(app, /没有倒计时/);
  assert.match(app, /墨流先观察，再开口/);
  assert.match(app, /不读取浏览记录、屏幕或其他应用/);
  assert.doesNotMatch(app, /ENERGY_OPTIONS|TARGET_OPTIONS|end-sheet|outcome-grid|结束时，你在哪里/);
  assert.doesNotMatch(app, /visibilitychange|PAGE_VISIBILITY|streak|排行榜/);
  assert.match(store, /inkflow:daily:v1/);
  assert.match(store, /sync-queue/);
  assert.match(store, /flushQueue/);
  assert.match(store, /mergeSessions/);
});

test("persists formal records in D1 and isolates writes by authenticated owner", async () => {
  const [route, schema, hosting, migration] = await Promise.all([
    readFile(new URL("app/api/attention/route.ts", projectRoot), "utf8"),
    readFile(new URL("db/schema.ts", projectRoot), "utf8"),
    readFile(new URL(".openai/hosting.json", projectRoot), "utf8"),
    readFile(new URL("drizzle/0000_flaky_medusa.sql", projectRoot), "utf8"),
  ]);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(route, /oai-authenticated-user-email/);
  assert.match(route, /local-preview/);
  assert.match(route, /CREATE TABLE IF NOT EXISTS attention_sessions/);
  assert.match(route, /CREATE TABLE IF NOT EXISTS attention_events/);
  assert.match(route, /WHERE id = \? AND owner_id = \?/);
  assert.match(route, /INSERT OR IGNORE INTO attention_events/);
  assert.match(schema, /attentionSessions/);
  assert.match(schema, /attentionEvents/);
  assert.match(migration, /CREATE TABLE `attention_sessions`/);
  assert.match(migration, /CREATE TABLE `attention_events`/);
});

test("ships an app-standard responsive, accessible and offline surface", async () => {
  const [layout, manifest, stylesheet, serviceWorker] = await Promise.all([
    readFile(new URL("app/layout.tsx", projectRoot), "utf8"),
    readFile(new URL("app/manifest.ts", projectRoot), "utf8"),
    readFile(new URL("app/globals.css", projectRoot), "utf8"),
    readFile(new URL("public/sw.js", projectRoot), "utf8"),
  ]);
  assert.match(layout, /看见注意力真实的一天/);
  assert.match(layout, /实时记下此刻的意图、走神、打断与回来/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(stylesheet, /\.pulse-control/);
  assert.match(stylesheet, /\.context-strip/);
  assert.match(stylesheet, /\.bottom-nav/);
  assert.match(stylesheet, /\.recovery-layer/);
  assert.match(stylesheet, /@media \(max-width: 620px\)/);
  assert.match(stylesheet, /prefers-reduced-motion: reduce/);
  assert.match(stylesheet, /button:focus-visible/);
  assert.match(serviceWorker, /inkflow-daily-v1/);
  await access(new URL("public/favicon.svg", projectRoot));
});
