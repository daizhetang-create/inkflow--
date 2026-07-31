import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("opens directly into the personal daily surface while preserving previous data layers", async () => {
  const [app, root, personal, store] = await Promise.all([
    readFile(new URL("app/AttentionApp.tsx", projectRoot), "utf8"),
    readFile(new URL("app/AttentionRoot.tsx", projectRoot), "utf8"),
    readFile(new URL("app/personal/DailyApp.tsx", projectRoot), "utf8"),
    readFile(new URL("app/attention/store.ts", projectRoot), "utf8"),
  ]);
  assert.match(root, /正在接回今天/);
  assert.match(app, /DailyApp/);
  assert.match(personal, /今天的节奏/);
  assert.match(personal, /开始专注/);
  assert.doesNotMatch(app, /一键开始记录|我回来了|recordReturnPulse|bottom-nav/);
  assert.match(store, /inkflow:daily:v1/);
  assert.match(store, /sync-queue/);
  assert.match(store, /flushQueue/);
  assert.match(store, /mergeSessions/);
});

test("ships the complete personal focus, rest, medication, meditation and review loop", async () => {
  const [app, personal, stylesheet] = await Promise.all([
    readFile(new URL("app/AttentionApp.tsx", projectRoot), "utf8"),
    readFile(new URL("app/personal/DailyApp.tsx", projectRoot), "utf8"),
    readFile(new URL("app/zero.css", projectRoot), "utf8"),
  ]);
  assert.match(app, /DailyApp/);
  assert.match(personal, /inkflow:personal:v1/);
  assert.match(personal, /medicine\("breakfast-medicine", settings\.breakfastTime, "早餐"\)/);
  assert.match(personal, /medicine\("lunch-medicine", settings\.lunchTime, "午餐"\)/);
  assert.match(personal, /medicine\("dinner-medicine", settings\.dinnerTime, "晚餐"\)/);
  assert.match(personal, /工作中间，停一下/);
  assert.match(personal, /睡前冥想/);
  assert.match(personal, /收好今天/);
  assert.match(personal, /finishTimerNow/);
  assert.match(personal, /kind: "rest"/);
  assert.match(personal, /30 \* 60000/);
  assert.match(personal, /10 \* 60000/);
  assert.match(personal, /Notification\.requestPermission/);
  assert.match(stylesheet, /\.focus-launch/);
  assert.match(stylesheet, /\.routine-list/);
  assert.match(stylesheet, /\.personal-timer/);
  assert.match(stylesheet, /\.breathing-orb/);
  assert.match(stylesheet, /@media \(max-width: 640px\)/);
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
  assert.match(layout, /今天的节奏/);
  assert.match(layout, /饭后用药提醒/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(stylesheet, /\.personal-main/);
  assert.match(stylesheet, /\.focus-launch/);
  assert.match(stylesheet, /\.settings-sheet/);
  assert.match(stylesheet, /\.personal-toast/);
  assert.match(stylesheet, /@media \(max-width: 640px\)/);
  assert.match(stylesheet, /prefers-reduced-motion: reduce/);
  assert.match(stylesheet, /button:focus-visible/);
  assert.match(serviceWorker, /inkflow-personal-v7/);
  assert.match(serviceWorker, /notificationclick/);
  await access(new URL("public/favicon.svg", projectRoot));
});
