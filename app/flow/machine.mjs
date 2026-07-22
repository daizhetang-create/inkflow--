export const FLOW_STAGES = [
  "idle",
  "intention",
  "waiting",
  "drift",
  "return",
  "active",
  "review",
];

const ALLOWED = {
  idle: ["START_WAIT", "REPORT_DRIFT", "HYDRATE"],
  intention: ["START_WAIT", "REPORT_DRIFT", "NEW_SESSION", "HYDRATE"],
  waiting: ["SIGNAL_DONE", "EARLY_RETURN", "REPORT_DRIFT", "NEW_SESSION", "HYDRATE"],
  drift: ["RESCUE", "NEW_SESSION", "HYDRATE"],
  return: ["REJOIN", "REPORT_DRIFT", "NEW_SESSION", "HYDRATE"],
  active: ["START_WAIT", "COMPLETE_STEP", "REPORT_DRIFT", "NEW_SESSION", "HYDRATE"],
  review: ["RECORD_REVIEW", "NEW_SESSION", "HYDRATE"],
};

export function createSession(now = Date.now()) {
  return {
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
    signaledAt: null,
    returnedAt: null,
    rejoinedAt: null,
    completedAt: null,
    review: null,
    returnLatencyMs: null,
    driftCount: 0,
    lastSignal: null,
  };
}

function ensureAllowed(session, type) {
  if (!ALLOWED[session.stage]?.includes(type)) {
    throw new Error(`Illegal Inkflow transition: ${session.stage} -> ${type}`);
  }
}

function nextRevision(session, patch, now) {
  return {
    ...session,
    ...patch,
    revision: session.revision + 1,
    updatedAt: now,
  };
}

export function transition(session, event, now = Date.now()) {
  if (!session || !FLOW_STAGES.includes(session.stage)) {
    throw new Error("Invalid Inkflow session");
  }
  ensureAllowed(session, event.type);

  if (event.type === "HYDRATE") {
    if (!event.session || event.session.revision <= session.revision) return session;
    return event.session;
  }

  if (event.type === "NEW_SESSION") {
    const fresh = createSession(now);
    return {
      ...fresh,
      mode: event.mode ?? session.mode,
      source: event.source ?? session.source,
      lowEnergy: session.lowEnergy,
      revision: session.revision + 1,
    };
  }

  if (event.type === "START_WAIT") {
    const objective = String(event.objective ?? session.objective).trim();
    const nextAction = String(event.nextAction ?? session.nextAction).trim();
    if (!objective || !nextAction) throw new Error("Objective and next action are required");
    const source = event.source === "simulation" ? "simulation" : "manual";
    const durationMs = source === "simulation" ? Math.max(1000, Number(event.durationMs) || 20000) : null;
    return nextRevision(session, {
      stage: "waiting",
      mode: event.mode ?? session.mode,
      objective,
      nextAction,
      source,
      microAction: event.microAction ?? session.microAction,
      lowEnergy: Boolean(event.lowEnergy),
      checkpointAt: now,
      expectedAt: durationMs ? now + durationMs : null,
      signaledAt: null,
      returnedAt: null,
      rejoinedAt: null,
      completedAt: null,
      review: null,
      returnLatencyMs: null,
      lastSignal: null,
    }, now);
  }

  if (event.type === "SIGNAL_DONE" || event.type === "EARLY_RETURN") {
    return nextRevision(session, {
      stage: "return",
      signaledAt: now,
      returnedAt: now,
      lastSignal: event.type === "EARLY_RETURN" ? "early" : (event.signalSource ?? session.source),
    }, now);
  }

  if (event.type === "REPORT_DRIFT") {
    return nextRevision(session, {
      stage: "drift",
      objective: String(event.objective ?? session.objective),
      nextAction: String(event.nextAction ?? session.nextAction),
      driftCount: session.driftCount + 1,
    }, now);
  }

  if (event.type === "RESCUE") {
    const nextAction = String(event.nextAction ?? "").trim();
    if (!nextAction) throw new Error("A smaller next action is required");
    return nextRevision(session, {
      stage: "return",
      objective: String(event.objective ?? session.objective).trim(),
      nextAction,
      signaledAt: now,
      returnedAt: now,
      lastSignal: "self-rescue",
    }, now);
  }

  if (event.type === "REJOIN") {
    const returnedAt = session.returnedAt ?? now;
    return nextRevision(session, {
      stage: "active",
      rejoinedAt: now,
      returnLatencyMs: Math.max(0, now - returnedAt),
    }, now);
  }

  if (event.type === "COMPLETE_STEP") {
    return nextRevision(session, {
      stage: "review",
      completedAt: now,
      review: null,
    }, now);
  }

  if (event.type === "RECORD_REVIEW") {
    const outcomes = ["complete", "partial", "lost", "skipped"];
    if (!outcomes.includes(event.outcome)) throw new Error("Invalid review outcome");
    return nextRevision(session, { review: event.outcome }, now);
  }

  return session;
}

export function eventRecord(before, after, event, now = Date.now()) {
  return {
    id: `event-${now}-${after.revision}`,
    sessionId: after.id,
    at: now,
    type: event.type,
    from: before.stage,
    to: after.stage,
    revision: after.revision,
    source: after.lastSignal ?? after.source,
  };
}

export function returnSeconds(session) {
  if (session.returnLatencyMs == null) return null;
  return Math.max(1, Math.round(session.returnLatencyMs / 1000));
}
