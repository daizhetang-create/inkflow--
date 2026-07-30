export type Energy = "clear" | "steady" | "scattered" | "tired";
export type Outcome = "complete" | "progress" | "pause";
export type EventKind = "drift" | "interrupt" | "idea" | "recovery" | "return";

export type AttentionEvent = {
  id: string;
  sessionId: string;
  kind: EventKind;
  note: string | null;
  createdAt: string;
};

export type AttentionSession = {
  id: string;
  intention: string;
  energyStart: Energy;
  energyEnd: Energy | null;
  targetMinutes: number | null;
  startedAt: string;
  endedAt: string | null;
  outcome: Outcome | null;
  note: string | null;
  status: "active" | "completed";
  updatedAt: string;
  events: AttentionEvent[];
};

export type SyncAction =
  | { key: string; action: "start"; session: Pick<AttentionSession, "id" | "intention" | "energyStart" | "targetMinutes" | "startedAt"> }
  | { key: string; action: "event"; event: AttentionEvent }
  | { key: string; action: "finish"; id: string; endedAt: string; outcome: Outcome; energyEnd: Energy; note?: string }
  | { key: string; action: "clear" };

export type Viewer = { displayName: string; email: string } | null;
