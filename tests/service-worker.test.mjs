import assert from "node:assert/strict";
import test from "node:test";

test("pre-caches the vNext shell and serves it when navigation is offline", async () => {
  const listeners = new Map();
  const added = [];
  const cachedShell = new Response("offline Inkflow shell", { status: 200, headers: { "content-type": "text/html" } });
  globalThis.self = {
    location: { origin: "http://localhost" },
    addEventListener(type, handler) { listeners.set(type, handler); },
    skipWaiting() {},
    clients: { claim() {} },
  };
  globalThis.caches = {
    open: async () => ({
      addAll: async (urls) => added.push(...urls),
      put: async () => undefined,
    }),
    keys: async () => [],
    delete: async () => true,
    match: async (request) => request === "/" ? cachedShell.clone() : undefined,
  };
  const onlineFetch = globalThis.fetch;
  try {
    await import(`../public/sw.js?test=${Date.now()}`);
    let installWork;
    listeners.get("install")({ waitUntil(promise) { installWork = promise; } });
    await installWork;
    assert.deepEqual(added, ["/", "/manifest.webmanifest", "/og-vnext.png"]);

    globalThis.fetch = async () => { throw new Error("offline"); };
    let responsePromise;
    listeners.get("fetch")({
      request: { method: "GET", url: "http://localhost/", mode: "navigate" },
      respondWith(promise) { responsePromise = promise; },
    });
    const response = await responsePromise;
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "offline Inkflow shell");
  } finally {
    globalThis.fetch = onlineFetch;
    delete globalThis.self;
    delete globalThis.caches;
  }
});
