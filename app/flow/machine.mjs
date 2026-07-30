export const FLOW_STAGES = [
  "idle", "intention", "waiting", "recovery", "drift", "return", "active", "review",
];

const COMMON = ["REPORT_DRIFT", "NEW_SESSION", "HYDRATE", "PAGE_VISIBILITY"];
const ALLOWED = {
  idle: ["BEGIN_INTENTION", "START_WAIT", ...COMMON],
  intention: ["BEGIN_INTENTION", "START_WAIT", ...COMMON],
  waiting: ["SELECT_MICRO_ACTION", "SIGNAL_DONE", "SIGNAL_FAILED", "EARLY_RETURN", ...COMMON],
  recovery: ["SELECT_MICRO_ACTION", "COMPLETE_RECOVERY", "SIGNAL_DONE", "SIGNAL_FAILED", "EARLY_RETURN", ...COMMON],
  drift: ["RESCUE", ...COMMON],
  return: ["REJOIN", ...COMMON],
  active: ["START_WAIT", "COMPLETE_STEP", ...COMMON],
  review: ["RECORD_REVIEW", ...COMMON],
};
const MICRO_ACTIONS = ["blank", "look", "stretch", "prompt"];

export function createSession(now = Date.now()) {
  return {
    schemaVersion: 1,
    id: `flow-${now}-${Math.random().toString(36).slice(2, 8)}`,
    revision: 0,
    stage: "idle",
    mode: "ai",
    objective: "",
    nextAction: "",
    source: "manual",
    microAction: "blank",
    lowEnergy: false,
    createdAt: now,
    updatedAt: now,
    checkpointAt: null,
    expectedAt: null,
    microActionAt: null,
    recoveryCompletedAt: null,
    signaledAt: null,
    returnedAt: null,
    rejoinedAt: null,
    completedAt: null,
    review: null,
    returnLatencyMs: null,
    driftCount: 0,
    lastSignal: null,
    taskOutcome: null,
    pageVisibility: "visible",
    hiddenCount: 0,
    lastHiddenAt: null,
    lastVisibleAt: now,
  };
}

function ensureAllowed(session, type) {
  if (!ALLOWED[session.stage]?.includes(type)) {
    throw new Error(`Illegal Inkflow transition: ${session.stage} -> ${type}`);
  }
}

function nextRevision(session, patch, now) {
  return { ...session, ...patch, schemaVersion: 1, revision: session.revision + 1, updatedAt: now };
}

export function transition(session, event, now = Date.now()) {
  if (!session || !FLOW_STAGES.includes(session.stage)) throw new Error("Invalid Inkflow session");
  ensureAllowed(session, event.type);

  if (event.type === "HYDRATE") {
    if (!event.session || event.session.revision <= session.revision) return session;
    return event.session;
  }
  if (event.type === "PAGE_VISIBILITY") {
    const visibility = event.visibility === "hidden" ? "hidden" : "visible";
    if (visibility === session.pageVisibility) return session;
    return nextRevision(session, {
      pageVisibility: visibility,
      hiddenCount: visibility === "hidden" ? session.hiddenCount + 1 : session.hiddenCount,
      lastHiddenAt: visibility === "hidden" ? now : session.lastHiddenAt,
      lastVisibleAt: visibility === "visible" ? now : session.lastVisibleAt,
    }, now);
  }
  if (event.type === "NEW_SESSION") {
    const fresh = createSession(now);
    return { ...fresh, mode: event.mode ?? session.mode, source: event.source ?? session.source, lowEnergy: session.lowEnergy, revision: session.revision + 1 };
  }
  if (event.type === "BEGIN_INTENTION") {
    return nextRevision(session, { stage: "intention", mode: event.mode ?? session.mode }, now);
  }
  if (event.type === "START_WAIT") {
    const objective = String(event.objective ?? session.objective).trim();
    const nextAction = String(event.nextAction ?? session.nextAction).trim();
    if (!objective || !nextAction) throw new Error("Objective and next action are required");
    const source = event.source === "simulation" ? "simulation" : "manual";
    const durationMs = source === "simulation" ? Math.max(1000, Number(event.durationMs) || 20000) : null;
    return nextRevision(session, {
      stage: "waiting", mode: event.mode ?? session.mode, objective, nextAction, source,
      microAction: event.microAction ?? session.microAction, lowEnergy: Boolean(event.lowEnergy),
      checkpointAt: now, expectedAt: durationMs ? now + durationMs : null,
      microActionAt: null, recoveryCompletedAt: null, signaledAt: null, returnedAt: null,
      rejoinedAt: null, completedAt: null, review: null, returnLatencyMs: null,
      lastSignal: null, taskOutcome: null,
    }, now);
  }
  if (event.type === "SELECT_MICRO_ACTION") {
    const microAction = MICRO_ACTIONS.includes(event.microAction) ? event.microAction : "blank";
    return nextRevision(session, { stage: "recovery", microAction, microActionAt: now, recoveryCompletedAt: null }, now);
  }
  if (event.type === "COMPLETE_RECOVERY") {
    return nextRevision(session, { stage: "waiting", recoveryCompletedAt: now }, now);
  }
  if (event.type === "SIGNAL_DONE" || event.type === "SIGNAL_FAILED" || event.type === "EARLY_RETURN") {
    const taskOutcome = event.type === "SIGNAL_FAILED" ? "failed" : event.type === "EARLY_RETURN" ? "early" : "completed";
    return nextRevision(session, {
      stage: "return", signaledAt: now, returnedAt: now,
      lastSignal: event.type === "EARLY_RETURN" ? "manual" : (event.signalSource ?? session.source),
      taskOutcome,
    }, now);
  }
  if (event.type === "REPORT_DRIFT") {
    return nextRevision(session, {
      stage: "drift", objective: String(event.objective ?? session.objective),
      nextAction: String(event.nextAction ?? session.nextAction), driftCount: session.driftCount + 1,
    }, now);
  }
  if (event.type === "RESCUE") {
    const nextAction = String(event.nextAction ?? "").trim();
    if (!nextAction) throw new Error("A smaller next action is required");
    return nextRevision(session, {
      stage: "return", objective: String(event.objective ?? session.objective).trim(), nextAction,
      signaledAt: now, returnedAt: now, lastSignal: "self-rescue", taskOutcome: "rescue",
    }, now);
  }
  if (event.type === "REJOIN") {
    const returnedAt = session.returnedAt ?? now;
    return nextRevision(session, { stage: "active", rejoinedAt: now, returnLatencyMs: Math.max(0, now - returnedAt) }, now);
  }
  if (event.type === "COMPLETE_STEP") {
    return nextRevision(session, { stage: "review", completedAt: now, review: null }, now);
  }
  if (event.type === "RECORD_REVIEW") {
    const outcomes = ["complete", "partial", "lost", "skipped"];
    if (!outcomes.includes(event.outcome)) throw new Error("Invalid review outcome");
    return nextRevision(session, { review: event.outcome }, now);
  }
  return session;
}

const EVENT_NAMES = {
  BEGIN_INTENTION: ["intention_started"],
  START_WAIT: ["checkpoint_saved", "wait_started"],
  SELECT_MICRO_ACTION: ["micro_action_selected"],
  COMPLETE_RECOVERY: ["micro_action_completed"],
  SIGNAL_DONE: ["ai_completed", "return_prompted"],
  SIGNAL_FAILED: ["ai_failed", "return_prompted"],
  EARLY_RETURN: ["return_prompted"],
  REPORT_DRIFT: ["drift_detected"],
  RESCUE: ["checkpoint_saved", "return_prompted"],
  REJOIN: ["return_confirmed", "return_latency"],
  COMPLETE_STEP: ["first_step_completed"],
  RECORD_REVIEW: ["context_recalled", "session_closed"],
  PAGE_VISIBILITY: ["page_visibility_changed"],
  NEW_SESSION: ["session_started"],
  HYDRATE: ["session_hydrated"],
};

function eventSource(after, event) {
  if (event.type === "PAGE_VISIBILITY" || event.type === "HYDRATE") return "system";
  if (event.signalSource === "simulation" || after.lastSignal === "simulation") return "simulation";
  return "user";
}

export function eventRecords(before, after, event, now = Date.now()) {
  const names = EVENT_NAMES[event.type] ?? [String(event.type).toLowerCase()];
  return names.map((type, index) => ({
    id: `event-${now}-${after.revision}-${index}`,
    sessionId: after.id,
    at: now,
    type,
    from: before.stage,
    to: after.stage,
    revision: after.revision,
    source: eventSource(after, event),
    payload: type === "return_latency" ? { milliseconds: after.returnLatencyMs } : undefined,
  }));
}

export function eventRecord(before, after, event, now = Date.now()) {
  return eventRecords(before, after, event, now)[0];
}

export function returnSeconds(session) {
  if (session.returnLatencyMs == null) return null;
  return Math.max(1, Math.round(session.returnLatencyMs / 1000));
}
