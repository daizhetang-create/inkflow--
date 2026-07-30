import type { AttentionEvent, AttentionSession, SyncAction } from "./types";

const CACHE_KEY = "inkflow:daily:v1";
const QUEUE_KEY = "inkflow:daily:sync-queue:v1";

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function loadCache(): AttentionSession[] {
  if (typeof window === "undefined") return [];
  const values = safeParse<AttentionSession[]>(window.localStorage.getItem(CACHE_KEY), []);
  return Array.isArray(values) ? values.filter((item) => item?.id && item?.startedAt) : [];
}

export function saveCache(sessions: AttentionSession[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(sessions.slice(0, 240)));
}

export function loadQueue(): SyncAction[] {
  if (typeof window === "undefined") return [];
  const values = safeParse<SyncAction[]>(window.localStorage.getItem(QUEUE_KEY), []);
  return Array.isArray(values) ? values : [];
}

export function queueAction(action: SyncAction) {
  if (typeof window === "undefined") return;
  const queue = loadQueue().filter((item) => item.key !== action.key);
  queue.push(action);
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-800)));
}

export function removeQueued(key: string) {
  if (typeof window === "undefined") return;
  const queue = loadQueue().filter((item) => item.key !== key);
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearLocalData() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CACHE_KEY);
  window.localStorage.removeItem(QUEUE_KEY);
}

export async function postAction(action: SyncAction) {
  const response = await fetch("/api/attention", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action, (property, value) => property === "key" ? undefined : value),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error ?? "暂时无法同步");
  }
}

export async function flushQueue() {
  for (const action of loadQueue()) {
    await postAction(action);
    removeQueued(action.key);
  }
}

export async function fetchRemote(): Promise<AttentionSession[]> {
  const from = new Date(Date.now() - 8 * 86400000).toISOString();
  const response = await fetch(`/api/attention?from=${encodeURIComponent(from)}`, { cache: "no-store" });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error ?? "暂时无法读取记录");
  }
  const data = await response.json() as { sessions?: Omit<AttentionSession, "events">[]; events?: AttentionEvent[] };
  const events = Array.isArray(data.events) ? data.events : [];
  return (Array.isArray(data.sessions) ? data.sessions : []).map((session) => ({
    ...session,
    events: events.filter((event) => event.sessionId === session.id),
  }));
}

export function mergeSessions(local: AttentionSession[], remote: AttentionSession[]) {
  const merged = new Map<string, AttentionSession>();
  [...remote, ...local].forEach((session) => {
    const existing = merged.get(session.id);
    if (!existing || new Date(session.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) merged.set(session.id, session);
  });
  return [...merged.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 240);
}
