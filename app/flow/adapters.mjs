const manual = Object.freeze({
  id: "manual",
  honesty: "manual",
  label: "手动信号",
  schedulesCompletion: false,
  remaining() { return null; },
  completionEvent() { return { type: "SIGNAL_DONE", signalSource: "manual" }; },
});

const simulation = Object.freeze({
  id: "simulation",
  honesty: "simulation",
  label: "明确模拟",
  schedulesCompletion: true,
  remaining(metadata, now = Date.now()) {
    if (!Number.isFinite(metadata?.expectedAt)) return null;
    return Math.max(0, metadata.expectedAt - now);
  },
  completionEvent() { return { type: "SIGNAL_DONE", signalSource: "simulation" }; },
});

export const WAIT_ADAPTERS = Object.freeze({ manual, simulation });

export function adapterFor(source) {
  return source === "simulation" ? WAIT_ADAPTERS.simulation : WAIT_ADAPTERS.manual;
}
