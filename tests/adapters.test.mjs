import assert from "node:assert/strict";
import test from "node:test";
import { WAIT_ADAPTERS, adapterFor } from "../app/flow/adapters.mjs";

test("manual adapter never pretends to schedule an external completion", () => {
  const adapter = adapterFor("manual");
  assert.equal(adapter.honesty, "manual");
  assert.equal(adapter.schedulesCompletion, false);
  assert.equal(adapter.remaining({ expectedAt: 20_000 }, 1_000), null);
  assert.deepEqual(adapter.completionEvent(), { type: "SIGNAL_DONE", signalSource: "manual" });
});

test("simulation adapter derives remaining time from persisted metadata", () => {
  const adapter = adapterFor("simulation");
  assert.equal(adapter.honesty, "simulation");
  assert.equal(adapter.schedulesCompletion, true);
  assert.equal(adapter.remaining({ expectedAt: 22_000 }, 2_000), 20_000);
  assert.equal(adapter.remaining({ expectedAt: 22_000 }, 30_000), 0);
  assert.deepEqual(adapter.completionEvent(), { type: "SIGNAL_DONE", signalSource: "simulation" });
  assert.equal(Object.isFrozen(WAIT_ADAPTERS), true);
});

test("unknown integrations safely degrade to manual", () => {
  assert.equal(adapterFor("future-unverified-adapter").id, "manual");
});
