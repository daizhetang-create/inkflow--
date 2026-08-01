/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, powerMonitor, Tray } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const APP_ID = "com.inkflow.personal";
const MAX_STATE_BYTES = 5 * 1024 * 1024;
const rendererPath = path.join(__dirname, "dist", "index.html");
const iconPath = path.join(__dirname, "assets", "icon.png");
const trayIconPath = path.join(__dirname, "assets", "tray.png");

let mainWindow = null;
let tray = null;
let isQuitting = false;
let routineInterval = null;
let timerInterval = null;
let stateCache = null;
let didExplainTray = false;
const liveNotifications = new Map();

const DEFAULT_STATE = {
  schemaVersion: 1,
  onboarded: false,
  settings: {
    focusMinutes: 45,
    breakMinutes: 8,
    meals: { breakfast: "08:00", lunch: "12:00", dinner: "18:30" },
    medicationOffset: 30,
    middayMeditation: { time: "15:00", minutes: 5 },
    bedtimeMeditation: { time: "23:00", minutes: 10 },
    reviewTime: "21:30",
    autoStart: false,
    minimizeToTray: true,
  },
  days: {},
  sessions: [],
  activeTimer: null,
};

function stateFile() {
  return path.join(app.getPath("userData"), "inkflow-personal.json");
}

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function normalizeState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return cloneDefault();
  const settings = value.settings && typeof value.settings === "object" ? value.settings : {};
  return {
    ...cloneDefault(),
    ...value,
    schemaVersion: 1,
    settings: {
      ...DEFAULT_STATE.settings,
      ...settings,
      meals: { ...DEFAULT_STATE.settings.meals, ...(settings.meals || {}) },
      middayMeditation: { ...DEFAULT_STATE.settings.middayMeditation, ...(settings.middayMeditation || {}) },
      bedtimeMeditation: { ...DEFAULT_STATE.settings.bedtimeMeditation, ...(settings.bedtimeMeditation || {}) },
    },
    days: value.days && typeof value.days === "object" && !Array.isArray(value.days) ? value.days : {},
    sessions: Array.isArray(value.sessions) ? value.sessions.slice(-500) : [],
    activeTimer: value.activeTimer && typeof value.activeTimer === "object" ? value.activeTimer : null,
  };
}

function loadState() {
  if (stateCache) return stateCache;
  try {
    const content = fs.readFileSync(stateFile(), "utf8");
    stateCache = normalizeState(JSON.parse(content));
  } catch {
    stateCache = cloneDefault();
  }
  return stateCache;
}

function writeState(value, broadcast = true) {
  const next = normalizeState(value);
  const serialized = JSON.stringify(next, null, 2);
  if (Buffer.byteLength(serialized, "utf8") > MAX_STATE_BYTES) throw new Error("STATE_TOO_LARGE");
  const target = stateFile();
  const temporary = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temporary, serialized, "utf8");
  fs.renameSync(temporary, target);
  stateCache = next;
  if (broadcast && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("state:changed", next);
  updateTrayMenu();
  return next;
}

function localDayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function clockOn(date, time) {
  const [hour, minute] = String(time || "00:00").split(":").map(Number);
  const value = new Date(date);
  value.setHours(hour || 0, minute || 0, 0, 0);
  return value.getTime();
}

function clockWithOffset(time, offset) {
  const base = new Date(2000, 0, 1);
  const [hour, minute] = String(time || "00:00").split(":").map(Number);
  base.setHours(hour || 0, (minute || 0) + Number(offset || 0), 0, 0);
  return `${String(base.getHours()).padStart(2, "0")}:${String(base.getMinutes()).padStart(2, "0")}`;
}

function buildRoutines(state, date = new Date()) {
  const { settings } = state;
  const medication = (id, mealName, mealTime) => {
    const time = clockWithOffset(mealTime, settings.medicationOffset);
    return { id, kind: "medicine", title: `${mealName}后用药`, body: "吃过后在墨流里记一下。", time, dueAt: clockOn(date, time) };
  };
  return [
    medication("breakfast-medicine", "早餐", settings.meals.breakfast),
    medication("lunch-medicine", "午餐", settings.meals.lunch),
    { id: "midday-meditation", kind: "meditation", title: "工作中间，停一下", body: `${settings.middayMeditation.minutes} 分钟呼吸休息。`, time: settings.middayMeditation.time, dueAt: clockOn(date, settings.middayMeditation.time) },
    medication("dinner-medicine", "晚餐", settings.meals.dinner),
    { id: "evening-review", kind: "review", title: "收好今天", body: "把完成与未完成从脑子里放下来。", time: settings.reviewTime, dueAt: clockOn(date, settings.reviewTime) },
    { id: "bedtime-meditation", kind: "meditation", title: "睡前冥想", body: `${settings.bedtimeMeditation.minutes} 分钟，慢慢结束今天。`, time: settings.bedtimeMeditation.time, dueAt: clockOn(date, settings.bedtimeMeditation.time) },
  ].sort((a, b) => a.dueAt - b.dueAt);
}

function ensureDay(state, key) {
  if (!state.days[key]) state.days[key] = { routines: {}, snoozes: {}, systemNotified: {}, review: null };
  state.days[key].routines ||= {};
  state.days[key].snoozes ||= {};
  state.days[key].systemNotified ||= {};
  return state.days[key];
}

function showWindow(command) {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  if (command) mainWindow.webContents.send("app:command", command);
}

function notify({ id, title, body, routineId = null, persistent = false }) {
  if (!Notification.isSupported()) return false;
  const notification = new Notification({
    id,
    groupId: "inkflow-daily",
    groupTitle: "墨流",
    title,
    body,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    timeoutType: persistent ? "never" : "default",
    actions: routineId ? [
      { type: "button", text: "打开墨流" },
      { type: "button", text: "10 分钟后" },
    ] : [],
  });
  liveNotifications.set(id, notification);
  notification.on("click", () => showWindow(routineId ? { type: "open-routine", routineId } : null));
  notification.on("action", (event, legacyIndex) => {
    const index = Number.isInteger(legacyIndex) ? legacyIndex : Number(event?.actionIndex ?? -1);
    if (!routineId || index !== 1) return showWindow({ type: "open-routine", routineId });
    const state = loadState();
    const key = localDayKey();
    const day = ensureDay(state, key);
    day.snoozes[routineId] = Date.now() + 10 * 60 * 1000;
    delete day.systemNotified[`${routineId}:initial`];
    delete day.systemNotified[`${routineId}:followup`];
    writeState(state);
  });
  notification.on("close", () => liveNotifications.delete(id));
  notification.show();
  return true;
}

function processRoutines() {
  const state = loadState();
  if (!state.onboarded) return;
  const now = Date.now();
  const key = localDayKey();
  const day = ensureDay(state, key);
  let changed = false;

  for (const routine of buildRoutines(state)) {
    if (day.routines[routine.id]?.status) continue;
    const dueAt = Number(day.snoozes[routine.id] || routine.dueAt);
    const candidates = [
      { key: `${routine.id}:initial`, at: dueAt, title: routine.title, followup: false },
      ...(routine.kind === "medicine" ? [{ key: `${routine.id}:followup`, at: dueAt + 30 * 60 * 1000, title: `仍未记录：${routine.title}`, followup: true }] : []),
    ];
    for (const candidate of candidates) {
      if (day.systemNotified[candidate.key]) continue;
      if (candidate.at > now || now - candidate.at > 90 * 60 * 1000) continue;
      day.systemNotified[candidate.key] = new Date(now).toISOString();
      changed = true;
      notify({
        id: `routine-${candidate.key}-${key}`,
        title: candidate.title,
        body: candidate.followup ? "还没有留下记录。吃过就打开墨流标记；暂时不方便可再等 10 分钟。" : routine.body,
        routineId: routine.id,
        persistent: routine.kind === "medicine",
      });
    }
  }
  if (changed) writeState(state);
}

function completedSession(timer, endedAt) {
  return {
    id: `session_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    kind: timer.kind,
    label: timer.label,
    startedAt: new Date(timer.startedAt).toISOString(),
    completedAt: new Date(endedAt).toISOString(),
    minutes: Math.max(1, Math.round(timer.totalSeconds / 60)),
  };
}

function processTimer() {
  const state = loadState();
  const timer = state.activeTimer;
  const now = Date.now();
  if (!timer || timer.status !== "running" || Number(timer.endAt) > now) return;
  state.sessions = [...state.sessions.slice(-499), completedSession(timer, now)];

  if (timer.kind === "focus") {
    const seconds = Math.max(60, Number(state.settings.breakMinutes || 8) * 60);
    state.activeTimer = {
      id: `rest_${Date.now()}`,
      kind: "rest",
      label: "离开屏幕，让大脑松一下",
      startedAt: now,
      endAt: now + seconds * 1000,
      remainingSeconds: seconds,
      totalSeconds: seconds,
      status: "running",
    };
    writeState(state);
    notify({ id: `focus-finished-${timer.id}`, title: "这一段完成了", body: `${state.settings.breakMinutes} 分钟休息已经开始。站起来、喝口水，先不要继续坐着。` });
    return;
  }

  if (timer.kind === "meditation" && timer.routineId) {
    const day = ensureDay(state, localDayKey());
    day.routines[timer.routineId] = { status: "done", completedAt: new Date(now).toISOString() };
  }
  state.activeTimer = null;
  writeState(state);
  notify({
    id: `timer-finished-${timer.id}`,
    title: timer.kind === "rest" ? "休息结束" : "冥想完成",
    body: timer.kind === "rest" ? "准备好时，再回来开始下一段。" : "这次停顿已经记下来了。",
  });
}

function nextRoutineLabel() {
  const state = loadState();
  if (!state.onboarded) return "先完成首次设置";
  const now = Date.now();
  const day = ensureDay(state, localDayKey());
  const next = buildRoutines(state).find((routine) => !day.routines[routine.id]?.status && Number(day.snoozes[routine.id] || routine.dueAt) >= now);
  return next ? `下一项 ${next.time} · ${next.title}` : "今天没有待到点的日常";
}

function updateTrayMenu() {
  if (!tray) return;
  const state = loadState();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开墨流", click: () => showWindow() },
    { label: nextRoutineLabel(), enabled: false },
    { type: "separator" },
    { label: `开始 ${state.settings.focusMinutes} 分钟专注`, click: () => showWindow({ type: "start-focus" }) },
    { label: "隐藏窗口", click: () => mainWindow?.hide() },
    { type: "separator" },
    { label: "退出墨流", click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function createTray() {
  if (tray) return;
  const image = nativeImage.createFromPath(fs.existsSync(trayIconPath) ? trayIconPath : iconPath);
  tray = new Tray(image.resize({ width: 20, height: 20 }));
  tray.setToolTip("墨流 · 今天的节奏");
  tray.on("double-click", () => showWindow());
  updateTrayMenu();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 840,
    minHeight: 660,
    show: false,
    backgroundColor: "#f4f1ea",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    title: "墨流",
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#f4f1ea", symbolColor: "#242824", height: 44 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.setMenu(null);
  const trustedRendererUrl = pathToFileURL(rendererPath).toString();
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== trustedRendererUrl) event.preventDefault();
  });
  mainWindow.loadFile(rendererPath);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.on("close", (event) => {
    if (isQuitting || !loadState().settings.minimizeToTray) return;
    event.preventDefault();
    mainWindow.hide();
    if (!didExplainTray) {
      didExplainTray = true;
      notify({ id: "tray-explainer", title: "墨流仍在后台", body: "窗口关掉后，计时和提醒仍会继续。要完全退出，请使用托盘菜单。" });
    }
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

function assertTrusted(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error("UNTRUSTED_RENDERER");
}

function registerIpc() {
  ipcMain.handle("state:load", (event) => { assertTrusted(event); return loadState(); });
  ipcMain.handle("state:save", (event, value) => { assertTrusted(event); const saved = writeState(value, false); setTimeout(() => { processTimer(); processRoutines(); }, 0); return saved; });
  ipcMain.handle("system:get-settings", (event) => {
    assertTrusted(event);
    return { autoStart: app.getLoginItemSettings().openAtLogin, notificationsSupported: Notification.isSupported(), packaged: app.isPackaged, version: app.getVersion() };
  });
  ipcMain.handle("system:set-auto-launch", (event, enabled) => {
    assertTrusted(event);
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled), openAsHidden: true });
    const state = loadState();
    state.settings.autoStart = Boolean(enabled);
    writeState(state);
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle("notification:test", (event) => {
    assertTrusted(event);
    return notify({ id: `test-${Date.now()}`, title: "墨流提醒正常", body: "以后专注结束、冥想和饭后用药都会从这里出现。" });
  });
  ipcMain.on("window:hide", (event) => { assertTrusted(event); mainWindow.hide(); });
  ipcMain.on("app:quit", (event) => { assertTrusted(event); isQuitting = true; app.quit(); });
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
else {
  app.setAppUserModelId(APP_ID);
  app.on("second-instance", () => showWindow());
  app.whenReady().then(() => {
    registerIpc();
    createWindow();
    createTray();
    processRoutines();
    processTimer();
    timerInterval = setInterval(processTimer, 1000);
    routineInterval = setInterval(processRoutines, 15000);
    powerMonitor.on("resume", () => { processTimer(); processRoutines(); });
  });
  app.on("before-quit", () => { isQuitting = true; });
  app.on("window-all-closed", (event) => event?.preventDefault?.());
  app.on("activate", () => showWindow());
  app.on("quit", () => {
    if (routineInterval) clearInterval(routineInterval);
    if (timerInterval) clearInterval(timerInterval);
  });
}

module.exports = {
  DEFAULT_STATE,
  buildRoutines,
  clockWithOffset,
  localDayKey,
  normalizeState,
};
