import type { FlowSession } from "./machine.mjs";

export const STORAGE = {
  snapshot: "inkflow:vnext:snapshot",
  events: "inkflow:vnext:events",
  profile: "inkflow:vnext:profile",
  history: "inkflow:vnext:history",
} as const;

export type FlowProfile = {
  onboarded: boolean;
  notifications: boolean;
  preferredMode: string;
  completedReturns: number;
};

const defaultProfile: FlowProfile = {
  onboarded: false,
  notifications: false,
  preferredMode: "ai",
  completedReturns: 0,
};

function parse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export function loadSnapshot(): FlowSession | null {
  if (typeof window === "undefined") return null;
  return parse<FlowSession | null>(localStorage.getItem(STORAGE.snapshot), null);
}

export function loadProfile(): FlowProfile {
  if (typeof window === "undefined") return defaultProfile;
  return { ...defaultProfile, ...parse<Partial<FlowProfile>>(localStorage.getItem(STORAGE.profile), {}) };
}

export function loadEvents(): Record<string, unknown>[] {
  if (typeof window === "undefined") return [];
  return parse<Record<string, unknown>[]>(localStorage.getItem(STORAGE.events), []);
}

export function loadHistory(): FlowSession[] {
  if (typeof window === "undefined") return [];
  return parse<FlowSession[]>(localStorage.getItem(STORAGE.history), []);
}

export function saveSnapshot(session: FlowSession) {
  localStorage.setItem(STORAGE.snapshot, JSON.stringify(session));
}

export function appendEvent(event: Record<string, unknown>) {
  const next = [...loadEvents(), event].slice(-240);
  localStorage.setItem(STORAGE.events, JSON.stringify(next));
}

export function saveProfile(profile: FlowProfile) {
  localStorage.setItem(STORAGE.profile, JSON.stringify(profile));
}

export function archiveSession(session: FlowSession) {
  const history = loadHistory().filter((item) => item.id !== session.id);
  localStorage.setItem(STORAGE.history, JSON.stringify([session, ...history].slice(0, 30)));
}

export function clearVnextData() {
  Object.values(STORAGE).forEach((key) => localStorage.removeItem(key));
}
