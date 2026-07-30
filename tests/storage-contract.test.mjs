import assert from "node:assert/strict";
import test from "node:test";
import { createSession } from "../app/flow/machine.mjs";
import { STORAGE, clearVnextData, isFlowSession, loadHistory, loadProfile, loadSnapshot, saveProfile, saveSnapshot } from "../app/flow/storage.ts";

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

function withBrowserStorage(run) {
  const storage = new MemoryStorage();
  globalThis.window = { localStorage: storage };
  globalThis.localStorage = storage;
  try { run(storage); } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
}

test("validates and restores a schema-versioned local snapshot", () => withBrowserStorage(() => {
  const session = createSession(1_000);
  saveSnapshot(session);
  assert.ok(isFlowSession(loadSnapshot()));
  assert.equal(loadSnapshot().schemaVersion, 1);
}));

test("safely falls back on corrupt snapshots and filters corrupt history", () => withBrowserStorage((storage) => {
  storage.setItem(STORAGE.snapshot, "{broken");
  storage.setItem(STORAGE.history, JSON.stringify([{ fake: true }, createSession(2_000)]));
  assert.equal(loadSnapshot(), null);
  assert.equal(loadHistory().length, 1);
}));

test("persists notification refusal, silent reminders, and low-energy guidance", () => withBrowserStorage(() => {
  const profile = {
    ...loadProfile(),
    onboarded: true,
    notificationDecision: "denied",
    notifications: false,
    reminderPreference: "silent",
    reducedGuidance: true,
  };
  saveProfile(profile);
  assert.deepEqual(loadProfile(), profile);
}));

test("clears only Inkflow vNext keys and leaves legacy data untouched", () => withBrowserStorage((storage) => {
  storage.setItem("inkflow:sessions", "legacy");
  for (const key of Object.values(STORAGE)) storage.setItem(key, "vnext");
  clearVnextData();
  assert.equal(storage.getItem("inkflow:sessions"), "legacy");
  for (const key of Object.values(STORAGE)) assert.equal(storage.getItem(key), null);
}));
