import assert from "node:assert/strict";
import test from "node:test";
import { createSession, eventRecords, returnSeconds, transition } from "../app/flow/machine.mjs";

function start(overrides = {}, at = 2_000) {
  let session = createSession(1_000);
  session = transition(session, { type: "BEGIN_INTENTION", mode: overrides.mode ?? "ai" }, 1_500);
  return transition(session, {
    type: "START_WAIT",
    objective: "重构状态机",
    nextAction: "跑失败路径",
    source: "simulation",
    durationMs: 20_000,
    ...overrides,
  }, at);
}

test("runs intention → checkpoint → recovery → return → active → review", () => {
  let session = start();
  assert.equal(session.stage, "waiting");
  assert.equal(session.expectedAt, 22_000);
  session = transition(session, { type: "SELECT_MICRO_ACTION", microAction: "look" }, 4_000);
  assert.equal(session.stage, "recovery");
  assert.equal(session.microAction, "look");
  session = transition(session, { type: "COMPLETE_RECOVERY" }, 7_000);
  assert.equal(session.stage, "waiting");
  session = transition(session, { type: "SIGNAL_DONE", signalSource: "simulation" }, 22_000);
  assert.equal(session.stage, "return");
  assert.equal(session.taskOutcome, "completed");
  session = transition(session, { type: "REJOIN" }, 24_400);
  assert.equal(session.stage, "active");
  assert.equal(returnSeconds(session), 2);
  session = transition(session, { type: "COMPLETE_STEP" }, 28_000);
  session = transition(session, { type: "RECORD_REVIEW", outcome: "complete" }, 28_100);
  assert.equal(session.stage, "review");
  assert.equal(session.review, "complete");
});

test("models both 20-second and 5-minute simulations without a countdown dependency", () => {
  const short = start({ durationMs: 20_000 });
  const long = start({ durationMs: 300_000 });
  assert.equal(short.expectedAt - short.checkpointAt, 20_000);
  assert.equal(long.expectedAt - long.checkpointAt, 300_000);
  const restoredAfterDeadline = transition(long, { type: "SIGNAL_DONE", signalSource: "simulation" }, long.expectedAt + 5_000);
  assert.equal(restoredAfterDeadline.stage, "return");
  assert.equal(restoredAfterDeadline.lastSignal, "simulation");
});

test("keeps a session waiting indefinitely when the user has not returned", () => {
  const waiting = start({ source: "manual" });
  const hydrated = transition(waiting, { type: "HYDRATE", session: { ...waiting, revision: waiting.revision } }, 86_402_000);
  assert.equal(hydrated, waiting);
  assert.equal(hydrated.stage, "waiting");
  assert.equal(hydrated.completedAt, null);
});

test("handles failed tasks and early returns without erasing the checkpoint", () => {
  const waiting = start({ source: "manual" });
  const failed = transition(waiting, { type: "SIGNAL_FAILED", signalSource: "manual" }, 5_000);
  assert.equal(failed.stage, "return");
  assert.equal(failed.taskOutcome, "failed");
  assert.equal(failed.nextAction, "跑失败路径");
  const early = transition(waiting, { type: "EARLY_RETURN" }, 4_000);
  assert.equal(early.stage, "return");
  assert.equal(early.taskOutcome, "early");
});

test("rescues drift only after an explicit user report", () => {
  let session = createSession(1_000);
  session = transition(session, { type: "REPORT_DRIFT", objective: "检查发布", nextAction: "检查全部页面" }, 2_000);
  assert.equal(session.stage, "drift");
  session = transition(session, { type: "RESCUE", objective: "检查发布", nextAction: "只检查登录失败页" }, 2_500);
  assert.equal(session.stage, "return");
  assert.equal(session.lastSignal, "self-rescue");
  assert.equal(session.nextAction, "只检查登录失败页");
});

test("records page visibility without falsely changing the stage to drift", () => {
  let session = start({ source: "manual" });
  session = transition(session, { type: "PAGE_VISIBILITY", visibility: "hidden" }, 5_000);
  assert.equal(session.stage, "waiting");
  assert.equal(session.pageVisibility, "hidden");
  assert.equal(session.hiddenCount, 1);
  session = transition(session, { type: "PAGE_VISIBILITY", visibility: "visible" }, 6_000);
  assert.equal(session.stage, "waiting");
  assert.equal(session.lastVisibleAt, 6_000);
});

test("rejects illegal transitions, invalid checkpoints, and stale cross-tab hydration", () => {
  const idle = createSession(1_000);
  assert.throws(() => transition(idle, { type: "REJOIN" }, 2_000), /Illegal Inkflow transition/);
  assert.throws(() => transition(idle, { type: "START_WAIT", objective: "", nextAction: "B" }, 2_000), /required/);
  const waiting = start({ source: "manual" });
  const stale = { ...waiting, revision: waiting.revision - 1, stage: "return" };
  assert.equal(transition(waiting, { type: "HYDRATE", session: stale }, 3_000), waiting);
});

test("emits the required source-honest canonical event model", () => {
  const idle = createSession(1_000);
  const waiting = transition(idle, { type: "START_WAIT", objective: "A", nextAction: "B", source: "simulation", durationMs: 20_000 }, 2_000);
  assert.deepEqual(eventRecords(idle, waiting, { type: "START_WAIT" }, 2_000).map((event) => event.type), ["checkpoint_saved", "wait_started"]);
  const returned = transition(waiting, { type: "SIGNAL_DONE", signalSource: "simulation" }, 22_000);
  const signalEvents = eventRecords(waiting, returned, { type: "SIGNAL_DONE", signalSource: "simulation" }, 22_000);
  assert.deepEqual(signalEvents.map((event) => event.type), ["ai_completed", "return_prompted"]);
  assert.ok(signalEvents.every((event) => event.source === "simulation"));
  const active = transition(returned, { type: "REJOIN" }, 24_000);
  assert.deepEqual(eventRecords(returned, active, { type: "REJOIN" }, 24_000).map((event) => event.type), ["return_confirmed", "return_latency"]);
  const review = transition(active, { type: "COMPLETE_STEP" }, 25_000);
  const closed = transition(review, { type: "RECORD_REVIEW", outcome: "partial" }, 26_000);
  assert.deepEqual(eventRecords(review, closed, { type: "RECORD_REVIEW", outcome: "partial" }, 26_000).map((event) => event.type), ["context_recalled", "session_closed"]);
});

test("preserves all four modes and low-energy intent through the same kernel", () => {
  for (const mode of ["ai", "work", "read", "meditate"]) {
    const waiting = start({ mode, source: "manual", lowEnergy: true });
    assert.equal(waiting.mode, mode);
    assert.equal(waiting.lowEnergy, true);
    const recovery = transition(waiting, { type: "SELECT_MICRO_ACTION", microAction: "blank" }, 3_000);
    assert.equal(recovery.stage, "recovery");
  }
});
