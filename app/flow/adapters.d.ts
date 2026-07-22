export type WaitAdapter = {
  id: "manual" | "simulation";
  honesty: "manual" | "simulation";
  label: string;
  schedulesCompletion: boolean;
  remaining(metadata: { expectedAt: number | null }, now?: number): number | null;
  completionEvent(): { type: "SIGNAL_DONE"; signalSource: "manual" | "simulation" };
};
export const WAIT_ADAPTERS: Readonly<Record<"manual" | "simulation", WaitAdapter>>;
export function adapterFor(source: string): WaitAdapter;
