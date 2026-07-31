"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";

type RoutineId =
  | "breakfast-medicine"
  | "lunch-medicine"
  | "midday-meditation"
  | "dinner-medicine"
  | "bedtime-meditation"
  | "evening-review";

type RoutineKind = "medicine" | "meditation" | "review";
type RoutineStatus = "done" | "skipped";
type TimerKind = "focus" | "rest" | "meditation";

type Settings = {
  focusMinutes: number;
  breakMinutes: number;
  breakfastTime: string;
  lunchTime: string;
  dinnerTime: string;
  medicineOffset: number;
  middayTime: string;
  middayMinutes: number;
  bedtimeTime: string;
  bedtimeMinutes: number;
  reviewTime: string;
};

type Review = {
  completed: string;
  unfinished: string;
  result: string;
  savedAt: string;
};

type DayLog = {
  routines: Partial<Record<RoutineId, RoutineStatus>>;
  snoozedUntil: Partial<Record<RoutineId, number>>;
  notified: Record<string, boolean>;
  review?: Review;
};

type Session = {
  id: string;
  kind: TimerKind;
  label: string;
  startedAt: string;
  completedAt: string;
  plannedMinutes: number;
};

type ActiveTimer = {
  id: string;
  kind: TimerKind;
  label: string;
  routineId?: RoutineId;
  startedAt: number;
  endAt: number;
  remainingSeconds: number;
  totalSeconds: number;
  status: "running" | "paused";
};

type PersonalState = {
  settings: Settings;
  days: Record<string, DayLog>;
  sessions: Session[];
  activeTimer: ActiveTimer | null;
};

type Routine = {
  id: RoutineId;
  kind: RoutineKind;
  title: string;
  detail: string;
  time: string;
  dueAt: number;
  durationMinutes?: number;
};

const STORAGE_KEY = "inkflow:personal:v1";

const DEFAULT_SETTINGS: Settings = {
  focusMinutes: 45,
  breakMinutes: 8,
  breakfastTime: "08:00",
  lunchTime: "12:00",
  dinnerTime: "18:30",
  medicineOffset: 30,
  middayTime: "15:00",
  middayMinutes: 5,
  bedtimeTime: "23:00",
  bedtimeMinutes: 10,
  reviewTime: "21:30",
};

function emptyDay(): DayLog {
  return { routines: {}, snoozedUntil: {}, notified: {} };
}

function initialState(): PersonalState {
  if (typeof window === "undefined") {
    return { settings: DEFAULT_SETTINGS, days: {}, sessions: [], activeTimer: null };
  }
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<PersonalState> | null;
    if (!stored) throw new Error("empty");
    return {
      settings: { ...DEFAULT_SETTINGS, ...stored.settings },
      days: stored.days ?? {},
      sessions: stored.sessions ?? [],
      activeTimer: stored.activeTimer ?? null,
    };
  } catch {
    return { settings: DEFAULT_SETTINGS, days: {}, sessions: [], activeTimer: null };
  }
}

function dayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function atTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const value = new Date(date);
  value.setHours(hours || 0, minutes || 0, 0, 0);
  return value.getTime();
}

function addMinutes(time: string, minutes: number) {
  const value = new Date(2000, 0, 1);
  const [hours, mins] = time.split(":").map(Number);
  value.setHours(hours || 0, (mins || 0) + minutes, 0, 0);
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

function buildRoutines(settings: Settings, date: Date): Routine[] {
  const medicine = (id: RoutineId, meal: string, mealName: string): Routine => {
    const time = addMinutes(meal, settings.medicineOffset);
    return {
      id,
      kind: "medicine",
      title: `${mealName}后用药`,
      detail: `按你的设置：饭后 ${settings.medicineOffset} 分钟`,
      time,
      dueAt: atTime(date, time),
    };
  };

  return [
    medicine("breakfast-medicine", settings.breakfastTime, "早餐"),
    medicine("lunch-medicine", settings.lunchTime, "午餐"),
    {
      id: "midday-meditation",
      kind: "meditation",
      title: "工作中间，停一下",
      detail: `${settings.middayMinutes} 分钟呼吸休息`,
      time: settings.middayTime,
      dueAt: atTime(date, settings.middayTime),
      durationMinutes: settings.middayMinutes,
    },
    medicine("dinner-medicine", settings.dinnerTime, "晚餐"),
    {
      id: "evening-review",
      kind: "review",
      title: "收好今天",
      detail: "完成了什么，还有什么没做",
      time: settings.reviewTime,
      dueAt: atTime(date, settings.reviewTime),
    },
    {
      id: "bedtime-meditation",
      kind: "meditation",
      title: "睡前冥想",
      detail: `${settings.bedtimeMinutes} 分钟，慢慢结束今天`,
      time: settings.bedtimeTime,
      dueAt: atTime(date, settings.bedtimeTime),
      durationMinutes: settings.bedtimeMinutes,
    },
  ].sort((a, b) => a.dueAt - b.dueAt);
}

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(date);
}

function timeLabel(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function relativeLabel(dueAt: number, now: number) {
  const difference = Math.round((dueAt - now) / 60000);
  if (difference > 60) return `${Math.floor(difference / 60)} 小时后`;
  if (difference > 0) return `${difference} 分钟后`;
  if (difference >= -4) return "现在";
  if (difference > -60) return `晚了 ${Math.abs(difference)} 分钟`;
  return "等待记录";
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

async function systemNotification(title: string, body: string, tag: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration) {
      await registration.showNotification(title, { body, tag, icon: "/favicon.svg", badge: "/favicon.svg" });
      return;
    }
    new Notification(title, { body, tag, icon: "/favicon.svg" });
  } catch {
    // The in-app reminder remains available when a browser blocks system notifications.
  }
}

export function DailyApp() {
  const [data, setData] = useState<PersonalState>(initialState);
  const [now, setNow] = useState(() => Date.now());
  const [focusMinutes, setFocusMinutes] = useState(() => initialState().settings.focusMinutes);
  const [focusLabel, setFocusLabel] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<Review>({ completed: "", unfinished: "", result: "", savedAt: "" });
  const [notice, setNotice] = useState("");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const finishedTimer = useRef("");

  const today = useMemo(() => new Date(now), [now]);
  const todayKey = dayKey(today);
  const day = data.days[todayKey] ?? emptyDay();
  const routines = useMemo(
    () => buildRoutines(data.settings, new Date(`${todayKey}T12:00:00`)),
    [data.settings, todayKey],
  );
  const completedRoutines = routines.filter((routine) => day.routines[routine.id]).length;
  const openRoutines = routines.filter((routine) => !day.routines[routine.id]);
  const nextRoutine = openRoutines.find((routine) => (day.snoozedUntil[routine.id] ?? routine.dueAt) >= now)
    ?? openRoutines.at(-1)
    ?? null;
  const urgentRoutine = [...openRoutines]
    .filter((routine) => (day.snoozedUntil[routine.id] ?? routine.dueAt) <= now)
    .sort((a, b) => (day.snoozedUntil[b.id] ?? b.dueAt) - (day.snoozedUntil[a.id] ?? a.dueAt))[0] ?? null;
  const featuredRoutine = urgentRoutine ?? nextRoutine;
  const timer = data.activeTimer;
  const timerRemaining = timer
    ? timer.status === "running" ? Math.max(0, Math.ceil((timer.endAt - now) / 1000)) : timer.remainingSeconds
    : 0;
  const timerProgress = timer ? Math.max(0, Math.min(1, 1 - timerRemaining / timer.totalSeconds)) : 0;
  const todayFocusMinutes = data.sessions
    .filter((session) => session.kind === "focus" && dayKey(new Date(session.completedAt)) === todayKey)
    .reduce((total, session) => total + session.plannedMinutes, 0);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), data.activeTimer ? 1000 : 15000);
    return () => window.clearInterval(interval);
  }, [data.activeTimer]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!settingsOpen && !reviewOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSettingsOpen(false);
      setReviewOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [settingsOpen, reviewOpen]);

  const markRoutine = useCallback((id: RoutineId, status: RoutineStatus) => {
    setData((current) => {
      const key = dayKey();
      const log = current.days[key] ?? emptyDay();
      return {
        ...current,
        days: {
          ...current.days,
          [key]: { ...log, routines: { ...log.routines, [id]: status } },
        },
      };
    });
  }, []);

  const startTimer = useCallback((kind: TimerKind, minutes: number, label: string, routineId?: RoutineId) => {
    const timestamp = Date.now();
    setData((current) => ({
      ...current,
      activeTimer: {
        id: makeId("timer"),
        kind,
        label,
        routineId,
        startedAt: timestamp,
        endAt: timestamp + minutes * 60000,
        remainingSeconds: minutes * 60,
        totalSeconds: minutes * 60,
        status: "running",
      },
    }));
    finishedTimer.current = "";
    setNow(timestamp);
  }, []);

  const finishTimerNow = useCallback((source: ActiveTimer, interrupted = false) => {
    const finishedAt = Date.now();
    setData((current) => {
      if (current.activeTimer?.id !== source.id) return current;
      const elapsedMinutes = Math.max(1, Math.round((finishedAt - source.startedAt) / 60000));
      const completedSession: Session = {
        id: makeId("session"),
        kind: source.kind,
        label: source.label,
        startedAt: new Date(source.startedAt).toISOString(),
        completedAt: new Date(finishedAt).toISOString(),
        plannedMinutes: Math.max(1, Math.min(Math.round(source.totalSeconds / 60), elapsedMinutes)),
      };
      let days = current.days;
      if (source.kind === "meditation" && source.routineId) {
        const key = dayKey(new Date(finishedAt));
        const log = days[key] ?? emptyDay();
        days = {
          ...days,
          [key]: { ...log, routines: { ...log.routines, [source.routineId]: interrupted ? "skipped" : "done" } },
        };
      }
      if (source.kind === "focus" && !interrupted) {
        const restSeconds = current.settings.breakMinutes * 60;
        return {
          ...current,
          days,
          sessions: [...current.sessions.slice(-199), completedSession],
          activeTimer: {
            id: makeId("rest"),
            kind: "rest",
            label: "离开屏幕，松一松",
            startedAt: finishedAt,
            endAt: finishedAt + restSeconds * 1000,
            remainingSeconds: restSeconds,
            totalSeconds: restSeconds,
            status: "running",
          },
        };
      }
      return {
        ...current,
        days,
        sessions: [...current.sessions.slice(-199), completedSession],
        activeTimer: null,
      };
    });
    navigator.vibrate?.([80, 60, 80]);
    if (source.kind === "focus" && !interrupted) {
      setNotice("专注结束，休息已经自动开始。");
      void systemNotification("该休息了", `离开屏幕 ${data.settings.breakMinutes} 分钟，让大脑松一下。`, "inkflow-rest");
    } else if (source.kind === "rest") {
      setNotice("休息完成。等你准备好，再开始下一段。");
      void systemNotification("休息结束", "回来时，只选下一件事。", "inkflow-rest-done");
    } else if (source.kind === "meditation") {
      setNotice("这次冥想已经记下来了。");
    }
  }, [data.settings.breakMinutes]);

  useEffect(() => {
    if (!timer || timer.status !== "running" || timerRemaining > 0 || finishedTimer.current === timer.id) return;
    finishedTimer.current = timer.id;
    finishTimerNow(timer, false);
  }, [finishTimerNow, timer, timerRemaining]);

  useEffect(() => {
    const reminderCheck = window.setTimeout(() => {
      const currentDay = data.days[todayKey] ?? emptyDay();
      const due = routines
        .filter((routine) => !currentDay.routines[routine.id])
        .flatMap((routine) => {
          const dueAt = currentDay.snoozedUntil[routine.id] ?? routine.dueAt;
          return [
            { routine, key: `${routine.id}:initial`, at: dueAt, followup: false },
            ...(routine.kind === "medicine" ? [{ routine, key: `${routine.id}:followup`, at: dueAt + 30 * 60000, followup: true }] : []),
          ];
        })
        .filter((entry) => entry.at <= now && now - entry.at <= 2 * 60 * 60000 && !currentDay.notified[entry.key])
        .sort((a, b) => b.at - a.at)[0];
      if (!due) return;

      setData((current) => {
        const log = current.days[todayKey] ?? emptyDay();
        return {
          ...current,
          days: { ...current.days, [todayKey]: { ...log, notified: { ...log.notified, [due.key]: true } } },
        };
      });
      const title = due.followup ? `还没有记录：${due.routine.title}` : due.routine.title;
      const body = due.routine.kind === "medicine"
        ? "吃过就点“已服用”；暂时不方便，可以 10 分钟后再提醒。"
        : due.routine.detail;
      setNotice(`${title} · ${body}`);
      void systemNotification(title, body, due.key);
    }, 0);
    return () => window.clearTimeout(reminderCheck);
  }, [data.days, now, routines, todayKey]);

  const startFocus = () => {
    const minutes = Math.max(5, Math.min(180, focusMinutes));
    startTimer("focus", minutes, focusLabel.trim() || "这一段，只做一件事");
  };

  const togglePause = () => {
    if (!timer) return;
    const timestamp = Date.now();
    setData((current) => {
      if (!current.activeTimer) return current;
      if (current.activeTimer.status === "running") {
        return {
          ...current,
          activeTimer: { ...current.activeTimer, status: "paused", remainingSeconds: Math.max(0, Math.ceil((current.activeTimer.endAt - timestamp) / 1000)) },
        };
      }
      return {
        ...current,
        activeTimer: { ...current.activeTimer, status: "running", endAt: timestamp + current.activeTimer.remainingSeconds * 1000 },
      };
    });
    setNow(timestamp);
  };

  const snoozeRoutine = (id: RoutineId) => {
    setData((current) => {
      const key = dayKey();
      const log = current.days[key] ?? emptyDay();
      const notified = { ...log.notified };
      delete notified[`${id}:initial`];
      delete notified[`${id}:followup`];
      return {
        ...current,
        days: {
          ...current.days,
          [key]: { ...log, notified, snoozedUntil: { ...log.snoozedUntil, [id]: Date.now() + 10 * 60000 } },
        },
      };
    });
    setNotice("好，10 分钟后再提醒你。");
  };

  const actOnRoutine = (routine: Routine) => {
    if (routine.kind === "medicine") {
      markRoutine(routine.id, "done");
      setNotice(`${routine.title}已记录。`);
      return;
    }
    if (routine.kind === "meditation") {
      startTimer("meditation", routine.durationMinutes ?? 5, routine.title, routine.id);
      return;
    }
    setReviewDraft(day.review ?? { completed: "", unfinished: "", result: "", savedAt: "" });
    setReviewOpen(true);
  };

  const saveReview = () => {
    const review = { ...reviewDraft, savedAt: new Date().toISOString() };
    setData((current) => {
      const key = dayKey();
      const log = current.days[key] ?? emptyDay();
      return {
        ...current,
        days: {
          ...current.days,
          [key]: { ...log, review, routines: { ...log.routines, "evening-review": "done" } },
        },
      };
    });
    setReviewOpen(false);
    setNotice("今天已经收好了。");
  };

  const enableNotifications = async () => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      await systemNotification("桌面提醒已开启", "墨流会在应用运行时提醒你休息、冥想和记录用药。", "inkflow-ready");
      setNotice("桌面提醒已开启。");
    }
  };

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setData((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));
    if (key === "focusMinutes") setFocusMinutes(Number(value));
  };

  const breathingPhase = timer && timer.kind !== "focus"
    ? ["吸气", "停留", "呼气"][Math.floor(((now - timer.startedAt) % 12000) / 4000)]
    : "";

  if (timer) {
    const isFocus = timer.kind === "focus";
    return (
      <main className={`personal-timer is-${timer.kind} ${timer.status === "paused" ? "is-paused" : ""}`} id="inkflow-main">
        {notice && <div className="personal-toast" role="status">{notice}</div>}
        <header className="timer-topbar">
          <span className="app-mark"><i/>墨流</span>
          <button className="text-button" onClick={() => finishTimerNow(timer, true)}>{isFocus ? "结束本段" : "跳过"}</button>
        </header>

        <section className="timer-stage" aria-live="polite">
          <div className="timer-context">
            <span>{isFocus ? "专注中" : timer.kind === "rest" ? "休息中" : "冥想中"}</span>
            <h1>{timer.label}</h1>
          </div>

          {!isFocus && (
            <div className="breathing-field" aria-hidden="true">
              <div className="breathing-orb"><span>{breathingPhase}</span></div>
            </div>
          )}

          <div className="timer-clock">
            <strong>{timeLabel(timerRemaining)}</strong>
            <div className="timer-line"><i style={{ "--timer-progress": `${timerProgress * 100}%` } as CSSProperties}/></div>
            <span>{timer.status === "paused" ? "时间停在这里" : isFocus ? "不用做更多，只留在这一件事里" : "离开屏幕，跟着呼吸就好"}</span>
          </div>

          <div className="timer-actions">
            <button className="circle-control" onClick={togglePause} aria-label={timer.status === "running" ? "暂停" : "继续"}>
              {timer.status === "running" ? <span className="pause-icon"/> : <span className="play-icon"/>}
            </button>
            {isFocus && <button className="finish-control" onClick={() => finishTimerNow(timer, false)}>完成，开始休息</button>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="personal-app">
      {notice && <div className="personal-toast" role="status">{notice}</div>}
      <a className="personal-skip" href="#inkflow-main">跳到今天</a>

      <header className="personal-topbar">
        <span className="app-mark"><i/>墨流</span>
        <button className="settings-button" onClick={() => setSettingsOpen(true)} aria-label="打开设置"><span/><span/><span/></button>
      </header>

      <main className="personal-main" id="inkflow-main">
        <section className="today-heading">
          <div>
            <span>{dateLabel(today)}</span>
            <h1>今天</h1>
          </div>
          <div className="today-summary" aria-label="今日完成情况">
            <strong>{completedRoutines}<span> / {routines.length}</span></strong>
            <small>日常已完成</small>
          </div>
        </section>

        <section className="focus-launch" aria-labelledby="focus-title">
          <div className="focus-launch-copy">
            <span className="section-kicker">现在，先做一段</span>
            <h2 id="focus-title">{focusMinutes} 分钟<br/>只做一件事。</h2>
          </div>
          <label className="focus-label-input">
            <span>这段准备做什么？</span>
            <input value={focusLabel} onChange={(event) => setFocusLabel(event.target.value)} maxLength={80} placeholder="可以不写，直接开始"/>
          </label>
          <div className="focus-presets" aria-label="专注时长">
            {[25, 45, 60].map((minutes) => (
              <button key={minutes} aria-pressed={focusMinutes === minutes} onClick={() => setFocusMinutes(minutes)}>{minutes}</button>
            ))}
            <span>分钟</span>
          </div>
          <button className="start-focus" onClick={startFocus}><span>开始专注</span><i>→</i></button>
          <p>结束后会自动进入 {data.settings.breakMinutes} 分钟休息。</p>
        </section>

        <aside className="next-card" aria-live="polite">
          {featuredRoutine ? (
            <>
              <div className="next-card-time"><span>{featuredRoutine.time}</span><small>{relativeLabel(day.snoozedUntil[featuredRoutine.id] ?? featuredRoutine.dueAt, now)}</small></div>
              <div className="next-card-copy">
                <span>下一件</span>
                <h2>{featuredRoutine.title}</h2>
                <p>{featuredRoutine.detail}</p>
              </div>
              <div className="next-card-actions">
                <button className="routine-primary" onClick={() => actOnRoutine(featuredRoutine)}>
                  {featuredRoutine.kind === "medicine" ? "已服用" : featuredRoutine.kind === "review" ? "写回顾" : "开始"}
                </button>
                {featuredRoutine.kind === "medicine" && <button className="routine-secondary" onClick={() => snoozeRoutine(featuredRoutine.id)}>10 分钟后</button>}
              </div>
            </>
          ) : (
            <div className="all-done"><span>✓</span><div><h2>今天的日常都完成了</h2><p>剩下的时间，不必再证明什么。</p></div></div>
          )}
        </aside>

        <section className="daily-rhythm" aria-labelledby="rhythm-title">
          <div className="section-heading">
            <div><span className="section-kicker">TODAY</span><h2 id="rhythm-title">今天的节奏</h2></div>
            <p>{todayFocusMinutes ? `已专注 ${todayFocusMinutes} 分钟` : "从一件小事开始"}</p>
          </div>
          <div className="routine-list">
            {routines.map((routine) => {
              const status = day.routines[routine.id];
              const dueAt = day.snoozedUntil[routine.id] ?? routine.dueAt;
              const isDue = !status && dueAt <= now;
              return (
                <article className={`routine-row ${status ? "is-complete" : ""} ${isDue ? "is-due" : ""}`} key={routine.id}>
                  <time>{routine.time}</time>
                  <button
                    className="routine-check"
                    onClick={() => status ? markRoutine(routine.id, status) : actOnRoutine(routine)}
                    aria-label={status ? `${routine.title}已${status === "done" ? "完成" : "跳过"}` : `处理${routine.title}`}
                    aria-pressed={Boolean(status)}
                  ><i>{status ? "✓" : ""}</i></button>
                  <button className="routine-copy" onClick={() => actOnRoutine(routine)}>
                    <strong>{routine.title}</strong>
                    <span>{status ? status === "done" ? "已完成" : "今天跳过" : isDue ? "现在该做" : routine.detail}</span>
                  </button>
                  {!status && routine.kind === "medicine" && isDue && <button className="row-snooze" onClick={() => snoozeRoutine(routine.id)}>稍后</button>}
                  {!status && routine.kind !== "medicine" && <button className="row-action" onClick={() => actOnRoutine(routine)}>→</button>}
                </article>
              );
            })}
          </div>
        </section>

        <footer className="personal-footer">
          <p>数据只保存在这台设备上。用药时间请以医生或药师的安排为准。</p>
          <button onClick={() => setSettingsOpen(true)}>调整我的一天</button>
        </footer>
      </main>

      {settingsOpen && (
        <div className="sheet-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSettingsOpen(false)}>
          <section className="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <header className="sheet-header"><div><span>只需要设置一次</span><h2 id="settings-title">我的一天</h2></div><button onClick={() => setSettingsOpen(false)} aria-label="关闭设置">×</button></header>

            <div className="settings-group">
              <h3>专注与休息</h3>
              <label><span>默认专注</span><div><input type="number" min="5" max="180" step="5" value={data.settings.focusMinutes} onChange={(event) => updateSetting("focusMinutes", Number(event.target.value))}/><em>分钟</em></div></label>
              <label><span>每段后的休息</span><div><input type="number" min="1" max="30" value={data.settings.breakMinutes} onChange={(event) => updateSetting("breakMinutes", Number(event.target.value))}/><em>分钟</em></div></label>
            </div>

            <div className="settings-group">
              <h3>吃饭与用药提醒</h3>
              <label><span>早餐</span><input type="time" value={data.settings.breakfastTime} onChange={(event) => updateSetting("breakfastTime", event.target.value)}/></label>
              <label><span>午餐</span><input type="time" value={data.settings.lunchTime} onChange={(event) => updateSetting("lunchTime", event.target.value)}/></label>
              <label><span>晚餐</span><input type="time" value={data.settings.dinnerTime} onChange={(event) => updateSetting("dinnerTime", event.target.value)}/></label>
              <label><span>饭后多久提醒</span><div><input type="number" min="0" max="180" step="5" value={data.settings.medicineOffset} onChange={(event) => updateSetting("medicineOffset", Number(event.target.value))}/><em>分钟</em></div></label>
              <p>这里只负责提醒和记录，不判断药物、剂量或服用时间。请按医生或药师给你的实际安排设置。</p>
            </div>

            <div className="settings-group">
              <h3>两次冥想与回顾</h3>
              <label><span>工作中间</span><div><input type="time" value={data.settings.middayTime} onChange={(event) => updateSetting("middayTime", event.target.value)}/><input className="minute-input" type="number" min="1" max="30" value={data.settings.middayMinutes} onChange={(event) => updateSetting("middayMinutes", Number(event.target.value))}/><em>分钟</em></div></label>
              <label><span>睡前</span><div><input type="time" value={data.settings.bedtimeTime} onChange={(event) => updateSetting("bedtimeTime", event.target.value)}/><input className="minute-input" type="number" min="1" max="30" value={data.settings.bedtimeMinutes} onChange={(event) => updateSetting("bedtimeMinutes", Number(event.target.value))}/><em>分钟</em></div></label>
              <label><span>一天回顾</span><input type="time" value={data.settings.reviewTime} onChange={(event) => updateSetting("reviewTime", event.target.value)}/></label>
            </div>

            <div className="notification-setting">
              <div><strong>桌面提醒</strong><span>{notificationPermission === "granted" ? "已开启" : "休息、冥想和用药到点时弹出"}</span></div>
              {notificationPermission !== "granted" && notificationPermission !== "denied" && <button onClick={enableNotifications}>开启</button>}
              {notificationPermission === "denied" && <small>已被浏览器阻止，请在网站权限中重新允许。</small>}
              {notificationPermission === "granted" && <i>✓</i>}
              <p>网页在运行或保持后台时会可靠弹出；完全关闭浏览器后，系统可能无法唤醒网页。你也可以把它从浏览器菜单“安装到桌面”。</p>
            </div>

            <button className="sheet-done" onClick={() => setSettingsOpen(false)}>保存并回到今天</button>
          </section>
        </div>
      )}

      {reviewOpen && (
        <div className="sheet-layer review-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setReviewOpen(false)}>
          <section className="review-sheet" role="dialog" aria-modal="true" aria-labelledby="review-title">
            <header className="sheet-header"><div><span>不用写得完整</span><h2 id="review-title">收好今天</h2></div><button onClick={() => setReviewOpen(false)} aria-label="关闭回顾">×</button></header>
            <label><span>今天完成了什么？</span><textarea rows={3} value={reviewDraft.completed} onChange={(event) => setReviewDraft((current) => ({ ...current, completed: event.target.value }))} placeholder="哪怕只写一件"/></label>
            <label><span>还有什么没做？</span><textarea rows={2} value={reviewDraft.unfinished} onChange={(event) => setReviewDraft((current) => ({ ...current, unfinished: event.target.value }))} placeholder="留给明天，不留在脑子里"/></label>
            <label><span>今天最后一句话</span><input value={reviewDraft.result} onChange={(event) => setReviewDraft((current) => ({ ...current, result: event.target.value }))} placeholder="今天到这里就够了"/></label>
            <button className="sheet-done" onClick={saveReview}>保存今天</button>
          </section>
        </div>
      )}
    </div>
  );
}
