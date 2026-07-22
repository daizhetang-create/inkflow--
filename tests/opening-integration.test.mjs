import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

const mediaContract = [
  {
    path: "public/inkflow-opening/intro.mp4",
    bytes: 16_105_974,
    sha256: "0AC9B744C9DAE20F322786EC8808039E496E964737170021A48B0FBE920F5C40",
  },
  {
    path: "public/inkflow-opening/click-transition.mp4",
    bytes: 875_451,
    sha256: "7AA44FBE31EE5053C55A4847D9F4A9DBCACC034B4D24481DA0308D6F08721365",
  },
  {
    path: "public/inkflow-opening/end-frame.png",
    bytes: 2_030_262,
    sha256: "CC8CFFAEF72109E01F95C38759D5EF90313AD81ABFFB144AFBFE883C6EE8EE1F",
  },
];

test("ships the exact approved opening media", async () => {
  for (const asset of mediaContract) {
    const url = new URL(asset.path, projectRoot);
    const [details, contents] = await Promise.all([stat(url), readFile(url)]);
    assert.equal(details.size, asset.bytes, asset.path + " byte size");
    assert.equal(
      createHash("sha256").update(contents).digest("hex").toUpperCase(),
      asset.sha256,
      asset.path + " sha256",
    );
  }
});

test("opening integration preserves the state, fallback, and accessibility contracts", async () => {
  const [openingSource, pageSource, stylesheet, serviceWorker] = await Promise.all([
    readFile(new URL("app/InkflowOpening.tsx", projectRoot), "utf8"),
    readFile(new URL("app/page.tsx", projectRoot), "utf8"),
    readFile(new URL("app/globals.css", projectRoot), "utf8"),
    readFile(new URL("public/sw.js", projectRoot), "utf8"),
  ]);

  for (const phase of ["loading", "intro", "awaiting-entry", "transition", "complete"]) {
    assert.match(openingSource, new RegExp('"' + phase + '"'));
  }

  assert.match(openingSource, /inkflow:opening-complete/);
  assert.match(openingSource, /get\("intro"\) === "1"/);
  assert.match(openingSource, /prefers-reduced-motion: reduce/);
  assert.match(openingSource, /LOAD_FALLBACK_MS = 3000/);
  assert.match(openingSource, /aria-label=\{"\\u8fdb\\u5165\\u58a8\\u6d41"\}/);
  assert.match(openingSource, /inert=\{openingActive/);
  assert.match(openingSource, /document\.body\.style\.overflow = "hidden"/);
  assert.match(openingSource, /muted[\s\S]*playsInline[\s\S]*preload="auto"/);
  assert.match(pageSource, /<InkflowOpening>[\s\S]*<FocusApp \/>/);
  assert.match(stylesheet, /\.inkflow-opening\s*\{[\s\S]*position: fixed;[\s\S]*background: #f2ecdd/);
  assert.match(stylesheet, /width: 44vmin/);
  assert.match(serviceWorker, /inkflow-opening\/end-frame\.png/);
  assert.doesNotMatch(serviceWorker, /inkflow-opening\/(?:intro|click-transition)\.mp4/);
});
