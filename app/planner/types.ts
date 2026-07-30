export type PlanStatus = "planned" | "active" | "paused" | "completed";

export type PlanItem = {
  id: string;
  title: string;
  plannedStart: string;
  durationMinutes: number;
  status: PlanStatus;
  startedAt: string | null;
  elapsedSeconds: number;
  completedAt: string | null;
  updatedAt: string;
};

export type PlanAction =
  | { key: string; action: "upsert"; item: PlanItem }
  | { key: string; action: "delete"; id: string }
  | { key: string; action: "clearCompleted" };
