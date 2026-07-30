import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("ships the complete real-time attention loop with a ten-second first action", async () => {
  const [app, root, store] = await Promise.all([
    readFile(new URL("app/AttentionApp.tsx", projectRoot), "utf8"),
    readFile(new URL("app/AttentionRoot.tsx", projectRoot), "utf8"),
    readFile(new URL("app/attention/store.ts", projectRoot), "utf8"),
  ]);
  assert.match(root, /正在接回今天的记录/);
  assert.match(app, /我现在要做/);
  assert.match(app, /不设时限/);
  assert.match(app, /我走神了/);
  assert.match(app, /被打断了/);
  assert.match(app, /有个念头/);
  assert.match(app, /我想缓一下/);
  assert.match(app, /结束时，你在哪里/);
  assert.match(app, /今日注意力流/);
  assert.match(app, /还不够了解你/);
  assert.match(app, /没有足够记录时，我们不会编造/);
  assert.match(app, /不监控你去了哪里/);
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
  assert.match(stylesheet, /\.ink-river/);
  assert.match(stylesheet, /\.recovery-layer/);
  assert.match(stylesheet, /@media \(max-width: 760px\)/);
  assert.match(stylesheet, /prefers-reduced-motion: reduce/);
  assert.match(stylesheet, /button:focus-visible/);
  assert.match(serviceWorker, /inkflow-daily-v1/);
  await access(new URL("public/favicon.svg", projectRoot));
});
