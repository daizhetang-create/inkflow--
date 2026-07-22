export type FlowStage = "idle" | "intention" | "waiting" | "drift" | "return" | "active" | "review";
export type FlowMode = "ai" | "work" | "read" | "meditate";
export type FlowSource = "manual" | "simulation";
export type ReviewOutcome = "complete" | "partial" | "lost" | "skipped";
export interface FlowSession {
  id: string; revision: number; stage: FlowStage; mode: FlowMode; objective: string; nextAction: string;
  source: FlowSource; microAction: string; lowEnergy: boolean; createdAt: number; updatedAt: number;
  checkpointAt: number | null; expectedAt: number | null; signaledAt: number | null; returnedAt: number | null;
  rejoinedAt: number | null; completedAt: number | null; review: ReviewOutcome | null; returnLatencyMs: number | null;
  driftCount: number; lastSignal: string | null;
}
export type FlowEvent = { type: string; [key: string]: unknown };
export const FLOW_STAGES: FlowStage[];
export function createSession(now?: number): FlowSession;
export function transition(session: FlowSession, event: FlowEvent, now?: number): FlowSession;
export function eventRecord(before: FlowSession, after: FlowSession, event: FlowEvent, now?: number): Record<string, unknown>;
export function returnSeconds(session: FlowSession): number | null;
