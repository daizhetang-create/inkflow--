import { FLOW_STAGES, type FlowSession } from "./machine.mjs";

export const STORAGE = {
  snapshot: "inkflow:vnext:snapshot",
  events: "inkflow:vnext:events",
  profile: "inkflow:vnext:profile",
  history: "inkflow:vnext:history",
} as const;

export type FlowProfile = {
  schemaVersion: 1;
  onboarded: boolean;
  notifications: boolean;
  notificationDecision: "unknown" | "granted" | "denied" | "unsupported";
  reminderPreference: "gentle" | "silent";
  reducedGuidance: boolean;
  preferredMode: string;
  preferredMicroAction: string;
  completedReturns: number;
};

const defaultProfile: FlowProfile = {
  schemaVersion: 1,
  onboarded: false,
  notifications: false,
  notificationDecision: "unknown",
  reminderPreference: "gentle",
  reducedGuidance: false,
  preferredMode: "ai",
  preferredMicroAction: "blank",
  completedReturns: 0,
};

function parse(value: string | null): unknown {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function objectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function migrateSession(value: unknown): unknown {
  if (!objectLike(value)) return value;
  return {
    ...value,
    schemaVersion: 1,
    microActionAt: typeof value.microActionAt === "number" ? value.microActionAt : null,
    recoveryCompletedAt: typeof value.recoveryCompletedAt === "number" ? value.recoveryCompletedAt : null,
    taskOutcome: ["completed", "failed", "early", "rescue"].includes(String(value.taskOutcome)) ? value.taskOutcome : null,
    pageVisibility: value.pageVisibility === "hidden" ? "hidden" : "visible",
    hiddenCount: Number.isFinite(value.hiddenCount) ? value.hiddenCount : 0,
    lastHiddenAt: typeof value.lastHiddenAt === "number" ? value.lastHiddenAt : null,
    lastVisibleAt: typeof value.lastVisibleAt === "number" ? value.lastVisibleAt : null,
  };
}

export function isFlowSession(value: unknown): value is FlowSession {
  if (!objectLike(value)) return false;
  return value.schemaVersion === 1
    && typeof value.id === "string"
    && Number.isFinite(value.revision)
    && FLOW_STAGES.includes(value.stage as FlowSession["stage"])
    && typeof value.objective === "string"
    && typeof value.nextAction === "string"
    && (value.source === "manual" || value.source === "simulation")
    && Number.isFinite(value.createdAt)
    && Number.isFinite(value.updatedAt);
}

export function loadSnapshot(): FlowSession | null {
  if (typeof window === "undefined") return null;
  const candidate = migrateSession(parse(localStorage.getItem(STORAGE.snapshot)));
  return isFlowSession(candidate) ? candidate : null;
}

export function loadProfile(): FlowProfile {
  if (typeof window === "undefined") return defaultProfile;
  const candidate = parse(localStorage.getItem(STORAGE.profile));
  if (!objectLike(candidate)) return defaultProfile;
  const notificationDecision = ["unknown", "granted", "denied", "unsupported"].includes(String(candidate.notificationDecision))
    ? candidate.notificationDecision as FlowProfile["notificationDecision"]
    : candidate.notifications ? "granted" : "unknown";
  return {
    ...defaultProfile,
    ...candidate,
    schemaVersion: 1,
    notificationDecision,
    reminderPreference: candidate.reminderPreference === "silent" ? "silent" : "gentle",
    reducedGuidance: Boolean(candidate.reducedGuidance),
    notifications: notificationDecision === "granted" && Boolean(candidate.notifications),
  };
}

export function loadEvents(): Record<string, unknown>[] {
  if (typeof window === "undefined") return [];
  const value = parse(localStorage.getItem(STORAGE.events));
  return Array.isArray(value) ? value.filter(objectLike) : [];
}

export function loadHistory(): FlowSession[] {
  if (typeof window === "undefined") return [];
  const value = parse(localStorage.getItem(STORAGE.history));
  if (!Array.isArray(value)) return [];
  return value.map(migrateSession).filter(isFlowSession).slice(0, 30);
}

export function saveSnapshot(session: FlowSession) {
  localStorage.setItem(STORAGE.snapshot, JSON.stringify(session));
}

export function appendEvent(event: Record<string, unknown>) {
  const next = [...loadEvents(), event].slice(-240);
  localStorage.setItem(STORAGE.events, JSON.stringify(next));
}

export function saveProfile(profile: FlowProfile) {
  localStorage.setItem(STORAGE.profile, JSON.stringify({ ...profile, schemaVersion: 1 }));
}

export function archiveSession(session: FlowSession) {
  const history = loadHistory().filter((item) => item.id !== session.id);
  localStorage.setItem(STORAGE.history, JSON.stringify([session, ...history].slice(0, 30)));
}

export function clearVnextData() {
  Object.values(STORAGE).forEach((key) => localStorage.removeItem(key));
}
