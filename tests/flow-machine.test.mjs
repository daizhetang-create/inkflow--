import assert from "node:assert/strict";
import test from "node:test";
import { createSession, eventRecord, returnSeconds, transition } from "../app/flow/machine.mjs";

test("runs the canonical checkpoint → wait → return → rejoin → review loop", () => {
  let session = createSession(1_000);
  session = transition(session, { type: "START_WAIT", objective: "重构状态机", nextAction: "跑失败路径", source: "simulation", durationMs: 20_000 }, 2_000);
  assert.equal(session.stage, "waiting");
  assert.equal(session.expectedAt, 22_000);
  session = transition(session, { type: "SIGNAL_DONE", signalSource: "simulation" }, 22_000);
  assert.equal(session.stage, "return");
  assert.equal(session.lastSignal, "simulation");
  session = transition(session, { type: "REJOIN" }, 24_400);
  assert.equal(session.stage, "active");
  assert.equal(returnSeconds(session), 2);
  session = transition(session, { type: "COMPLETE_STEP" }, 28_000);
  session = transition(session, { type: "RECORD_REVIEW", outcome: "complete" }, 28_100);
  assert.equal(session.stage, "review");
  assert.equal(session.review, "complete");
});

test("rescues drift without pretending to detect it", () => {
  let session = createSession(1_000);
  session = transition(session, { type: "REPORT_DRIFT", objective: "检查发布", nextAction: "检查全部页面" }, 2_000);
  assert.equal(session.stage, "drift");
  session = transition(session, { type: "RESCUE", objective: "检查发布", nextAction: "只检查登录失败页" }, 2_500);
  assert.equal(session.stage, "return");
  assert.equal(session.lastSignal, "self-rescue");
  assert.equal(session.nextAction, "只检查登录失败页");
});

test("rejects illegal transitions and stale cross-tab hydration", () => {
  const idle = createSession(1_000);
  assert.throws(() => transition(idle, { type: "REJOIN" }, 2_000), /Illegal Inkflow transition/);
  const waiting = transition(idle, { type: "START_WAIT", objective: "A", nextAction: "B", source: "manual" }, 2_000);
  const stale = { ...waiting, revision: waiting.revision - 1, stage: "return" };
  assert.equal(transition(waiting, { type: "HYDRATE", session: stale }, 3_000), waiting);
});

test("records source-honest append-only events", () => {
  const before = createSession(1_000);
  const after = transition(before, { type: "START_WAIT", objective: "A", nextAction: "B", source: "manual" }, 2_000);
  const record = eventRecord(before, after, { type: "START_WAIT" }, 2_000);
  assert.deepEqual({ from: record.from, to: record.to, source: record.source }, { from: "idle", to: "waiting", source: "manual" });
});
