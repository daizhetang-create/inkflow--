import type { PlanAction, PlanItem } from "./types";

const CACHE_KEY = "inkflow:plans:v1";
const QUEUE_KEY = "inkflow:plans:sync-queue:v1";

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function loadPlanCache(): PlanItem[] {
  if (typeof window === "undefined") return [];
  const values = safeParse<PlanItem[]>(window.localStorage.getItem(CACHE_KEY), []);
  return Array.isArray(values)
    ? values.filter((item) => item?.id && item?.title && item?.plannedStart && item?.updatedAt).slice(0, 480)
    : [];
}

export function savePlanCache(items: PlanItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(items.slice(0, 480)));
}

function loadPlanQueue(): PlanAction[] {
  if (typeof window === "undefined") return [];
  const values = safeParse<PlanAction[]>(window.localStorage.getItem(QUEUE_KEY), []);
  return Array.isArray(values) ? values : [];
}

export function queuePlanAction(action: PlanAction) {
  if (typeof window === "undefined") return;
  const queue = loadPlanQueue().filter((item) => item.key !== action.key);
  queue.push(action);
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-800)));
}

export function removeQueuedPlanAction(key: string) {
  if (typeof window === "undefined") return;
  const queue = loadPlanQueue().filter((item) => item.key !== key);
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function postPlanAction(action: PlanAction) {
  const response = await fetch("/api/planner", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action, (property, value) => property === "key" ? undefined : value),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error ?? "计划暂时无法同步");
  }
}

export async function flushPlanQueue() {
  for (const action of loadPlanQueue()) {
    await postPlanAction(action);
    removeQueuedPlanAction(action.key);
  }
}

export async function fetchRemotePlans(): Promise<PlanItem[]> {
  const fromDate = new Date(Date.now() - 14 * 86400000);
  const toDate = new Date(Date.now() + 21 * 86400000);
  const response = await fetch(`/api/planner?from=${encodeURIComponent(fromDate.toISOString())}&to=${encodeURIComponent(toDate.toISOString())}`, { cache: "no-store" });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error ?? "计划暂时无法读取");
  }
  const data = await response.json() as { items?: PlanItem[] };
  return Array.isArray(data.items) ? data.items : [];
}

export function mergePlans(local: PlanItem[], remote: PlanItem[]) {
  const merged = new Map<string, PlanItem>();
  [...remote, ...local].forEach((item) => {
    const existing = merged.get(item.id);
    if (!existing || new Date(item.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) merged.set(item.id, item);
  });
  return [...merged.values()].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart)).slice(-480);
}
