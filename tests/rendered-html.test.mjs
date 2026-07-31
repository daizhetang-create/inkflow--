import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("keeps the attention data layer recoverable while removing the old surface", async () => {
  const [app, root, store] = await Promise.all([
    readFile(new URL("app/AttentionApp.tsx", projectRoot), "utf8"),
    readFile(new URL("app/AttentionRoot.tsx", projectRoot), "utf8"),
    readFile(new URL("app/attention/store.ts", projectRoot), "utf8"),
  ]);
  assert.match(root, /正在接回今天/);
  assert.match(root, /把下一段时间/);
  assert.match(app, /PlannerView/);
  assert.doesNotMatch(app, /一键开始记录|我回来了|recordReturnPulse|bottom-nav/);
  assert.match(store, /inkflow:daily:v1/);
  assert.match(store, /sync-queue/);
  assert.match(store, /flushQueue/);
  assert.match(store, /mergeSessions/);
});

test("ships a durable daily planning and countdown loop", async () => {
  const [app, planner, store, route, schema, migration, stylesheet] = await Promise.all([
    readFile(new URL("app/AttentionApp.tsx", projectRoot), "utf8"),
    readFile(new URL("app/planner/PlannerView.tsx", projectRoot), "utf8"),
    readFile(new URL("app/planner/store.ts", projectRoot), "utf8"),
    readFile(new URL("app/api/planner/route.ts", projectRoot), "utf8"),
    readFile(new URL("db/schema.ts", projectRoot), "utf8"),
    readFile(new URL("drizzle/0001_lush_diamondback.sql", projectRoot), "utf8"),
    readFile(new URL("app/zero.css", projectRoot), "utf8"),
  ]);
  assert.match(app, /PlannerView/);
  assert.match(planner, /把时间交给/);
  assert.match(planner, /现在开始/);
  assert.match(planner, /排到稍后/);
  assert.match(planner, /type="time"/);
  assert.match(planner, /draftDuration/);
  assert.match(planner, /startPlan/);
  assert.match(planner, /pausePlan/);
  assert.match(planner, /completePlan/);
  assert.match(planner, /extendPlan/);
  assert.match(planner, /elapsedSeconds/);
  assert.match(store, /inkflow:plans:v1/);
  assert.match(store, /flushPlanQueue/);
  assert.match(route, /CREATE TABLE IF NOT EXISTS plan_items/);
  assert.match(route, /WHERE plan_items.owner_id = excluded.owner_id/);
  assert.match(schema, /export const planItems/);
  assert.match(migration, /CREATE TABLE .*plan_items/);
  assert.match(stylesheet, /\.zero-sentence/);
  assert.match(stylesheet, /\.zero-progress/);
  assert.match(stylesheet, /@media \(max-width: 860px\)/);
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
    readFile(new URL("app/zero.css", projectRoot), "utf8"),
    readFile(new URL("public/sw.js", projectRoot), "utf8"),
  ]);
  assert.match(layout, /把时间交给一件事/);
  assert.match(layout, /只决定下一段/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(stylesheet, /\.zero-compose/);
  assert.match(stylesheet, /\.zero-focus/);
  assert.match(stylesheet, /\.zero-mobile-queue/);
  assert.match(stylesheet, /\.zero-toast/);
  assert.match(stylesheet, /@media \(max-width: 520px\)/);
  assert.match(stylesheet, /prefers-reduced-motion: reduce/);
  assert.match(stylesheet, /button:focus-visible/);
  assert.match(serviceWorker, /inkflow-daily-v3/);
  await access(new URL("public/favicon.svg", projectRoot));
});
