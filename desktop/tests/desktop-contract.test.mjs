import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..", "..");
const read = (...segments) => readFileSync(join(root, ...segments), "utf8");

const main = read("desktop", "main.cjs");
const preload = read("desktop", "preload.cjs");
const renderer = read("desktop", "renderer", "DesktopApp.tsx");
const model = read("desktop", "renderer", "model.ts");
const packageJson = JSON.parse(read("package.json"));

test("desktop window keeps the renderer isolated", () => {
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: "deny" \}\)\)/);
  assert.match(main, /will-navigate/);
});

test("preload exposes only the intended personal-app bridge", () => {
  const exposedMethods = [
    "loadState",
    "saveState",
    "getSystemSettings",
    "setAutoLaunch",
    "testNotification",
    "hideWindow",
    "quitApp",
    "onStateChanged",
    "onCommand",
  ];

  for (const method of exposedMethods) assert.match(preload, new RegExp(`\\b${method}:`));
  assert.doesNotMatch(preload, /require:\s*require/);
  assert.doesNotMatch(preload, /process:\s*process/);
});

test("background shell includes tray, native notifications, login launch and resume checks", () => {
  assert.match(main, /new Tray\(/);
  assert.match(main, /new Notification\(/);
  assert.match(main, /app\.setLoginItemSettings/);
  assert.match(main, /setInterval\(processTimer, 1000\)/);
  assert.match(main, /setInterval\(processRoutines, 15000\)/);
  assert.match(main, /powerMonitor\.on\("resume"/);
  assert.match(main, /requestSingleInstanceLock/);
});

test("state is bounded, normalized and written atomically", () => {
  assert.match(main, /MAX_STATE_BYTES\s*=\s*5\s*\*\s*1024\s*\*\s*1024/);
  assert.match(main, /normalizeState\(/);
  assert.match(main, /writeFileSync\(temporary/);
  assert.match(main, /renameSync\(temporary, target\)/);
  assert.match(main, /sessions:\s*Array\.isArray\(value\.sessions\)\s*\?\s*value\.sessions\.slice\(-500\)/);
});

test("daily defaults match the requested practical routine", () => {
  for (const source of [main, model]) {
    assert.match(source, /focusMinutes:\s*45/);
    assert.match(source, /breakMinutes:\s*8/);
    assert.match(source, /medicationOffset:\s*30/);
    assert.match(source, /middayMeditation:\s*\{ time:\s*"15:00", minutes:\s*5 \}/);
    assert.match(source, /bedtimeMeditation:\s*\{ time:\s*"23:00", minutes:\s*10 \}/);
    assert.match(source, /reviewTime:\s*"21:30"/);
  }
});

test("focus completion enters a timed rest and medicine gets a follow-up", () => {
  assert.match(main, /if \(timer\.kind === "focus"\)/);
  assert.match(main, /kind:\s*"rest"/);
  assert.match(main, /state\.settings\.breakMinutes/);
  assert.match(main, /dueAt \+ 30 \* 60 \* 1000/);
  assert.match(main, /now - candidate\.at > 90 \* 60 \* 1000/);
});

test("renderer closes the requested personal daily loop", () => {
  const requiredCopy = [
    "开始专注",
    "休息好了",
    "完成冥想",
    "已服用",
    "写回顾",
    "保存今天",
    "工作中间冥想",
    "睡前冥想",
    "三餐与用药",
    "测试系统提醒",
  ];
  for (const copy of requiredCopy) assert.ok(renderer.includes(copy), `missing UI copy: ${copy}`);
});

test("release scripts produce both installable and portable Windows targets", () => {
  assert.equal(packageJson.main, "desktop/main.cjs");
  assert.match(packageJson.scripts["desktop:dist"], /--win nsis portable --prepackaged release\/win-unpacked/);
  assert.deepEqual(packageJson.build.win.target, ["nsis", "portable"]);
  assert.equal(packageJson.build.appId, "com.inkflow.personal");
  assert.equal(packageJson.build.nsis.artifactName, "Inkflow-${version}-Setup.${ext}");
  assert.equal(packageJson.build.portable.artifactName, "Inkflow-${version}-Portable.${ext}");
});

test("the unpacked executable exists after packaging", { skip: !existsSync(join(root, "release", "win-unpacked", "墨流.exe")) }, () => {
  assert.ok(existsSync(join(root, "release", "win-unpacked", "墨流.exe")));
  assert.ok(existsSync(join(root, "release", "win-unpacked", "resources", "app", "desktop", "dist", "index.html")));
});
