import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import {
  ActiveTimer,
  AppState,
  cloneState,
  dayKey,
  DEFAULT_STATE,
  emptyDay,
  formatClock,
  formatDate,
  formatTimer,
  nextId,
  relativeTime,
  Review,
  Routine,
  RoutineId,
  routinesFor,
  Settings,
} from "./model";

type View = "today" | "history";
type SystemSettings = { autoStart: boolean; notificationsSupported: boolean; packaged: boolean; version: string };

function isMedicine(routine: Routine) {
  return routine.kind === "medicine";
}

function timerLabel(kind: ActiveTimer["kind"]) {
  if (kind === "focus") return "专注中";
  if (kind === "rest") return "休息中";
  return "冥想中";
}

export function DesktopApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [system, setSystem] = useState<SystemSettings | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<View>("today");
  const [focusMinutes, setFocusMinutes] = useState(45);
  const [focusLabel, setFocusLabel] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<Settings>(cloneState(DEFAULT_STATE.settings));
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<Review>({ completed: "", unfinished: "", result: "", savedAt: "" });
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingDraft, setOnboardingDraft] = useState<Settings>(cloneState(DEFAULT_STATE.settings));
  const [notice, setNotice] = useState("");
  const [highlightRoutine, setHighlightRoutine] = useState<RoutineId | null>(null);
  const stateRef = useRef<AppState | null>(null);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());

  const replaceState = useCallback((next: AppState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const commitState = useCallback((updater: (current: AppState) => AppState) => {
    const current = stateRef.current;
    if (!current) return;
    const next = updater(cloneState(current));
    replaceState(next);
    saveChain.current = saveChain.current
      .catch(() => undefined)
      .then(() => window.inkflowDesktop.saveState(next))
      .then((saved) => { stateRef.current = saved; });
  }, [replaceState]);

  useEffect(() => {
    let active = true;
    Promise.all([window.inkflowDesktop.loadState(), window.inkflowDesktop.getSystemSettings()]).then(([loaded, settings]) => {
      if (!active) return;
      replaceState(loaded);
      setSystem(settings);
      setFocusMinutes(loaded.settings.focusMinutes);
      setSettingsDraft(cloneState(loaded.settings));
      setOnboardingDraft(cloneState(loaded.settings));
    });
    const offState = window.inkflowDesktop.onStateChanged((next) => {
      replaceState(next);
      setFocusMinutes((current) => current || next.settings.focusMinutes);
    });
    const offCommand = window.inkflowDesktop.onCommand((command) => {
      if (command.type === "start-focus") {
        setView("today");
        setNotice("从托盘回来。准备好就开始这一段。");
      }
      if (command.type === "open-routine") {
        setView("today");
        setHighlightRoutine(command.routineId as RoutineId);
        setNotice("提醒已打开，请留下这次记录。");
      }
    });
    return () => { active = false; offState(); offCommand(); };
  }, [replaceState]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), state?.activeTimer ? 1000 : 15000);
    return () => window.clearInterval(interval);
  }, [state?.activeTimer]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!highlightRoutine) return;
    const timeout = window.setTimeout(() => setHighlightRoutine(null), 6500);
    return () => window.clearTimeout(timeout);
  }, [highlightRoutine]);

  if (!state || !system) return <LoadingScreen />;
  if (!state.onboarded) {
    return (
      <Onboarding
        step={onboardingStep}
        setStep={setOnboardingStep}
        draft={onboardingDraft}
        setDraft={setOnboardingDraft}
        onComplete={async () => {
          const autoStart = await window.inkflowDesktop.setAutoLaunch(onboardingDraft.autoStart);
          setSystem((current) => current ? { ...current, autoStart } : current);
          commitState((current) => ({ ...current, onboarded: true, settings: { ...onboardingDraft, autoStart } }));
          setFocusMinutes(onboardingDraft.focusMinutes);
          setNotice("已经设好了。先从一段专注开始。");
        }}
      />
    );
  }

  const date = new Date(now);
  const todayKey = dayKey(date);
  const today = state.days[todayKey] ?? emptyDay();
  const routines = routinesFor(state.settings, date);
  const pending = routines.filter((routine) => !today.routines[routine.id]?.status);
  const urgent = [...pending]
    .filter((routine) => Number(today.snoozes[routine.id] || routine.dueAt) <= now)
    .sort((a, b) => Number(today.snoozes[b.id] || b.dueAt) - Number(today.snoozes[a.id] || a.dueAt))[0];
  const next = pending.find((routine) => Number(today.snoozes[routine.id] || routine.dueAt) > now);
  const featured = urgent ?? next ?? null;
  const completedCount = routines.length - pending.length;
  const todaySessions = state.sessions.filter((session) => dayKey(new Date(session.completedAt)) === todayKey);
  const todayFocus = todaySessions.filter((session) => session.kind === "focus").reduce((sum, session) => sum + session.minutes, 0);
  const activeTimer = state.activeTimer;

  const startTimer = (kind: ActiveTimer["kind"], minutes: number, label: string, routineId?: RoutineId) => {
    const startedAt = Date.now();
    const seconds = Math.max(60, Math.round(minutes * 60));
    commitState((current) => ({
      ...current,
      activeTimer: {
        id: nextId(kind),
        kind,
        label,
        routineId,
        startedAt,
        endAt: startedAt + seconds * 1000,
        remainingSeconds: seconds,
        totalSeconds: seconds,
        status: "running",
      },
    }));
    setNow(startedAt);
  };

  const startFocus = () => {
    const minutes = Math.max(5, Math.min(180, focusMinutes));
    startTimer("focus", minutes, focusLabel.trim() || "这一段，只做一件事");
    setFocusLabel("");
  };

  const markRoutine = (id: RoutineId, status: "done" | "skipped") => {
    commitState((current) => {
      const key = dayKey();
      const log = current.days[key] ?? emptyDay();
      log.routines[id] = { status, completedAt: new Date().toISOString() };
      current.days[key] = log;
      return current;
    });
    setNotice(status === "done" ? "已经记下来了。" : "今天已跳过，不再提醒。");
    setHighlightRoutine(null);
  };

  const snoozeRoutine = (id: RoutineId) => {
    commitState((current) => {
      const key = dayKey();
      const log = current.days[key] ?? emptyDay();
      log.snoozes[id] = Date.now() + 10 * 60 * 1000;
      delete log.systemNotified[`${id}:initial`];
      delete log.systemNotified[`${id}:followup`];
      current.days[key] = log;
      return current;
    });
    setNotice("好，10 分钟后再提醒。");
  };

  const actOnRoutine = (routine: Routine) => {
    if (routine.kind === "medicine") return markRoutine(routine.id, "done");
    if (routine.kind === "meditation") return startTimer("meditation", routine.durationMinutes || 5, routine.title, routine.id);
    setReviewDraft(today.review ?? { completed: "", unfinished: "", result: "", savedAt: "" });
    setReviewOpen(true);
  };

  const saveReview = () => {
    commitState((current) => {
      const key = dayKey();
      const log = current.days[key] ?? emptyDay();
      log.review = { ...reviewDraft, savedAt: new Date().toISOString() };
      log.routines["evening-review"] = { status: "done", completedAt: new Date().toISOString() };
      current.days[key] = log;
      return current;
    });
    setReviewOpen(false);
    setNotice("今天已经收好了。");
  };

  if (activeTimer) {
    return (
      <TimerScreen
        timer={activeTimer}
        now={now}
        breakMinutes={state.settings.breakMinutes}
        onPause={() => {
          commitState((current) => {
            const timer = current.activeTimer;
            if (!timer) return current;
            if (timer.status === "running") {
              timer.remainingSeconds = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
              timer.status = "paused";
            } else {
              timer.endAt = Date.now() + timer.remainingSeconds * 1000;
              timer.status = "running";
            }
            return current;
          });
        }}
        onFinish={() => {
          if (activeTimer.kind === "focus") {
            const elapsedMinutes = Math.max(1, Math.round((Date.now() - activeTimer.startedAt) / 60000));
            const restStart = Date.now();
            commitState((current) => {
              current.sessions.push({
                id: nextId("session"),
                kind: "focus",
                label: activeTimer.label,
                startedAt: new Date(activeTimer.startedAt).toISOString(),
                completedAt: new Date(restStart).toISOString(),
                minutes: elapsedMinutes,
              });
              current.activeTimer = {
                id: nextId("rest"),
                kind: "rest",
                label: "离开屏幕，让大脑松一下",
                startedAt: restStart,
                endAt: restStart + state.settings.breakMinutes * 60000,
                remainingSeconds: state.settings.breakMinutes * 60,
                totalSeconds: state.settings.breakMinutes * 60,
                status: "running",
              };
              return current;
            });
            return;
          }
          if (activeTimer.kind === "meditation" && activeTimer.routineId) markRoutine(activeTimer.routineId, "done");
          commitState((current) => ({ ...current, activeTimer: null }));
        }}
        onCancel={() => {
          if (activeTimer.kind === "meditation" && activeTimer.routineId) markRoutine(activeTimer.routineId, "skipped");
          commitState((current) => ({ ...current, activeTimer: null }));
        }}
        onHide={() => window.inkflowDesktop.hideWindow()}
      />
    );
  }

  return (
    <div className="desktop-shell">
      {notice && <div className="desktop-toast" role="status">{notice}</div>}
      <header className="desktop-header">
        <button className="brand-button" onClick={() => setView("today")} aria-label="回到今天"><BrandMark/><strong>墨流</strong></button>
        <nav className="main-tabs" aria-label="主要页面">
          <button aria-current={view === "today" ? "page" : undefined} onClick={() => setView("today")}>今天</button>
          <button aria-current={view === "history" ? "page" : undefined} onClick={() => setView("history")}>记录</button>
        </nav>
        <div className="header-actions">
          <span className="background-status"><i/>后台提醒中</span>
          <button className="icon-button" onClick={() => { setSettingsDraft(cloneState(state.settings)); setSettingsOpen(true); }} aria-label="设置"><DotsIcon/></button>
        </div>
      </header>

      {view === "today" ? (
        <main className="today-layout">
          <section className="today-title">
            <div><span>{formatDate(date)}</span><h1>今天</h1></div>
            <div className="day-clock"><strong>{formatClock(date)}</strong><span>{completedCount} / {routines.length} 日常完成</span></div>
          </section>

          <section className="focus-panel" aria-labelledby="focus-heading">
            <div className="focus-panel-top">
              <span>下一段</span>
              <small>关闭窗口也会继续</small>
            </div>
            <h2 id="focus-heading">{focusMinutes} 分钟，<br/>先只做一件事。</h2>
            <label className="task-field">
              <span>这段准备做什么？</span>
              <input value={focusLabel} onChange={(event) => setFocusLabel(event.target.value)} maxLength={80} placeholder="可以不写，直接开始"/>
            </label>
            <div className="duration-row" aria-label="选择专注时长">
              {[25, 45, 60].map((minutes) => <button key={minutes} aria-pressed={focusMinutes === minutes} onClick={() => setFocusMinutes(minutes)}>{minutes}</button>)}
              <span>分钟</span>
            </div>
            <button className="focus-start" onClick={startFocus}><span>开始专注</span><i>→</i></button>
            <div className="focus-promise"><i/><span>结束后自动开始 {state.settings.breakMinutes} 分钟休息</span></div>
          </section>

          <section className="right-column">
            <NextRoutineCard
              routine={featured}
              now={now}
              snoozeUntil={featured ? today.snoozes[featured.id] : undefined}
              onDone={actOnRoutine}
              onSnooze={snoozeRoutine}
              onSkip={(routine) => markRoutine(routine.id, "skipped")}
            />

            <section className="rhythm-card" aria-labelledby="rhythm-title">
              <div className="card-heading"><div><span>TODAY</span><h2 id="rhythm-title">今天的节奏</h2></div><p>{todayFocus ? `专注 ${todayFocus} 分钟` : "先把今天走顺"}</p></div>
              <div className="routine-list">
                {routines.map((routine) => {
                  const log = today.routines[routine.id];
                  const dueAt = Number(today.snoozes[routine.id] || routine.dueAt);
                  return (
                    <article className={`routine-item ${log ? "is-done" : ""} ${!log && dueAt <= now ? "is-due" : ""} ${highlightRoutine === routine.id ? "is-highlighted" : ""}`} key={routine.id}>
                      <time>{routine.time}</time>
                      <button className="routine-check" aria-label={log ? `${routine.title}已记录` : `处理${routine.title}`} onClick={() => actOnRoutine(routine)}><i>{log ? "✓" : ""}</i></button>
                      <button className="routine-name" onClick={() => actOnRoutine(routine)}><strong>{routine.title}</strong><span>{log ? log.status === "done" ? "已完成" : "今天跳过" : dueAt <= now ? "现在该处理" : routine.detail}</span></button>
                      {!log && <button className="routine-arrow" onClick={() => actOnRoutine(routine)} aria-label={`打开${routine.title}`}>→</button>}
                    </article>
                  );
                })}
              </div>
            </section>
          </section>

          <footer className="today-footer">
            <div><span>今日专注</span><strong>{todayFocus}<small> 分钟</small></strong></div>
            <div><span>完成段数</span><strong>{todaySessions.filter((session) => session.kind === "focus").length}<small> 段</small></strong></div>
            <p>用药时间请以医生或药师的实际安排为准。墨流只提醒和记录。</p>
          </footer>
        </main>
      ) : (
        <HistoryView state={state} now={now}/>
      )}

      {settingsOpen && (
        <SettingsSheet
          draft={settingsDraft}
          setDraft={setSettingsDraft}
          system={system}
          onClose={() => setSettingsOpen(false)}
          onTestNotification={async () => {
            const shown = await window.inkflowDesktop.testNotification();
            setNotice(shown ? "测试提醒已经发出。" : "当前系统不支持提醒。");
          }}
          onSave={async () => {
            const autoStart = await window.inkflowDesktop.setAutoLaunch(settingsDraft.autoStart);
            setSystem((current) => current ? { ...current, autoStart } : current);
            commitState((current) => ({ ...current, settings: { ...settingsDraft, autoStart } }));
            setFocusMinutes(settingsDraft.focusMinutes);
            setSettingsOpen(false);
            setNotice("你的日常时间已经更新。");
          }}
        />
      )}

      {reviewOpen && (
        <ReviewSheet draft={reviewDraft} setDraft={setReviewDraft} onClose={() => setReviewOpen(false)} onSave={saveReview}/>
      )}
    </div>
  );
}

function LoadingScreen() {
  return <main className="loading-screen"><BrandMark/><span>正在接回你的今天</span><i/></main>;
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i/><b/></span>;
}

function DotsIcon() {
  return <span className="dots-icon" aria-hidden="true"><i/><i/><i/></span>;
}

function Onboarding({ step, setStep, draft, setDraft, onComplete }: {
  step: number;
  setStep: (step: number) => void;
  draft: Settings;
  setDraft: (draft: Settings) => void;
  onComplete: () => Promise<void>;
}) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft({ ...draft, [key]: value });
  return (
    <main className="onboarding-shell">
      <header className="onboarding-header"><span><BrandMark/><strong>墨流</strong></span><div>{[0, 1, 2].map((index) => <i key={index} className={index <= step ? "is-active" : ""}/>)}</div></header>
      <section className="onboarding-card">
        {step === 0 && (
          <div className="onboarding-step">
            <span className="onboarding-kicker">01 · 专注与休息</span>
            <h1>先设好你最常用的<br/>工作节奏。</h1>
            <p>以后打开墨流，只需要按一次“开始”。每段结束后，休息会自动接上。</p>
            <div className="big-choice" aria-label="默认专注时长">
              {[25, 45, 60].map((minutes) => <button key={minutes} aria-pressed={draft.focusMinutes === minutes} onClick={() => update("focusMinutes", minutes)}><strong>{minutes}</strong><span>分钟</span></button>)}
            </div>
            <label className="inline-setting"><span>每段结束后休息</span><div><input type="number" min="1" max="30" value={draft.breakMinutes} onChange={(event) => update("breakMinutes", Number(event.target.value))}/><em>分钟</em></div></label>
          </div>
        )}
        {step === 1 && (
          <div className="onboarding-step">
            <span className="onboarding-kicker">02 · 饭后提醒</span>
            <h1>你通常几点吃饭？</h1>
            <p>墨流会从吃饭时间自动向后计算提醒。请按照你真实的生活设置，而不是迁就默认值。</p>
            <div className="meal-grid">
              {(["breakfast", "lunch", "dinner"] as const).map((meal) => (
                <label key={meal}><span>{meal === "breakfast" ? "早餐" : meal === "lunch" ? "午餐" : "晚餐"}</span><input type="time" value={draft.meals[meal]} onChange={(event) => update("meals", { ...draft.meals, [meal]: event.target.value })}/></label>
              ))}
            </div>
            <label className="inline-setting"><span>饭后多久提醒用药</span><div><input type="number" min="0" max="180" step="5" value={draft.medicationOffset} onChange={(event) => update("medicationOffset", Number(event.target.value))}/><em>分钟</em></div></label>
            <div className="medical-note"><i>!</i><p>墨流不判断药物、剂量或服用方法。这里的时间必须以医生或药师给你的安排为准。</p></div>
          </div>
        )}
        {step === 2 && (
          <div className="onboarding-step">
            <span className="onboarding-kicker">03 · 两次停顿</span>
            <h1>给一天留两个<br/>真正停下来的位置。</h1>
            <p>一次放在工作中间，一次放在睡前。它们不是任务，只是避免你一直坐到透支。</p>
            <div className="routine-settings">
              <label><span><strong>工作中间冥想</strong><small>短暂离开工作</small></span><div><input type="time" value={draft.middayMeditation.time} onChange={(event) => update("middayMeditation", { ...draft.middayMeditation, time: event.target.value })}/><input type="number" min="1" max="30" value={draft.middayMeditation.minutes} onChange={(event) => update("middayMeditation", { ...draft.middayMeditation, minutes: Number(event.target.value) })}/><em>分</em></div></label>
              <label><span><strong>睡前冥想</strong><small>慢慢结束今天</small></span><div><input type="time" value={draft.bedtimeMeditation.time} onChange={(event) => update("bedtimeMeditation", { ...draft.bedtimeMeditation, time: event.target.value })}/><input type="number" min="1" max="30" value={draft.bedtimeMeditation.minutes} onChange={(event) => update("bedtimeMeditation", { ...draft.bedtimeMeditation, minutes: Number(event.target.value) })}/><em>分</em></div></label>
              <label><span><strong>一天回顾</strong><small>把没做完的放下来</small></span><input type="time" value={draft.reviewTime} onChange={(event) => update("reviewTime", event.target.value)}/></label>
            </div>
            <label className="switch-setting"><span><strong>开机后自动运行</strong><small>让提醒不需要你想起来打开应用</small></span><input type="checkbox" checked={draft.autoStart} onChange={(event) => update("autoStart", event.target.checked)}/><i/></label>
          </div>
        )}
        <footer className="onboarding-footer">
          <button className="onboarding-back" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>上一步</button>
          {step < 2
            ? <button className="onboarding-next" onClick={() => setStep(step + 1)}>继续 <span>→</span></button>
            : <button className="onboarding-next" onClick={onComplete}>开始使用墨流 <span>→</span></button>}
        </footer>
      </section>
      <p className="onboarding-footnote">所有记录只保存在这台电脑上。</p>
    </main>
  );
}

function NextRoutineCard({ routine, now, snoozeUntil, onDone, onSnooze, onSkip }: {
  routine: Routine | null;
  now: number;
  snoozeUntil?: number;
  onDone: (routine: Routine) => void;
  onSnooze: (id: RoutineId) => void;
  onSkip: (routine: Routine) => void;
}) {
  if (!routine) return <section className="next-routine is-empty"><span>✓</span><div><h2>今天的日常都完成了</h2><p>剩下的时间，不必再证明什么。</p></div></section>;
  const dueAt = Number(snoozeUntil || routine.dueAt);
  return (
    <section className={`next-routine ${dueAt <= now ? "is-due" : ""}`}>
      <div className="next-time"><strong>{routine.time}</strong><span>{relativeTime(dueAt, now)}</span></div>
      <div className="next-copy"><span>下一件</span><h2>{routine.title}</h2><p>{routine.detail}</p></div>
      <div className="next-actions">
        <button className="next-primary" onClick={() => onDone(routine)}>{isMedicine(routine) ? "已服用" : routine.kind === "review" ? "写回顾" : "开始"}</button>
        {isMedicine(routine) && <button onClick={() => onSnooze(routine.id)}>10 分钟后</button>}
        {isMedicine(routine) && <button className="skip-action" onClick={() => onSkip(routine)}>今天跳过</button>}
      </div>
    </section>
  );
}

function TimerScreen({ timer, now, breakMinutes, onPause, onFinish, onCancel, onHide }: {
  timer: ActiveTimer;
  now: number;
  breakMinutes: number;
  onPause: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onHide: () => void;
}) {
  const remaining = timer.status === "running" ? Math.max(0, Math.ceil((timer.endAt - now) / 1000)) : timer.remainingSeconds;
  const progress = Math.max(0, Math.min(1, 1 - remaining / timer.totalSeconds));
  const cycle = Math.floor(((now - timer.startedAt) % 12000) / 4000);
  const breath = ["吸气", "停留", "呼气"][cycle];
  const quiet = timer.kind !== "focus";
  return (
    <main className={`timer-screen is-${timer.kind} ${timer.status === "paused" ? "is-paused" : ""}`}>
      <header className="timer-header"><span><BrandMark/><strong>墨流</strong></span><button onClick={onHide}>隐藏到后台</button></header>
      <section className="timer-content">
        <div className="timer-title"><span>{timerLabel(timer.kind)}</span><h1>{timer.label}</h1></div>
        {quiet && <div className="breath-space" aria-hidden="true"><div className="breath-orb"><span>{breath}</span></div></div>}
        <div className="timer-value">
          <strong>{formatTimer(remaining)}</strong>
          <div className="timer-track"><i style={{ "--progress": `${progress * 100}%` } as CSSProperties}/></div>
          <span>{timer.status === "paused" ? "时间停在这里" : timer.kind === "focus" ? "不用做更多，只留在这一件事里" : "离开屏幕，跟着呼吸就好"}</span>
        </div>
        <div className="timer-controls">
          <button className="round-control" onClick={onPause} aria-label={timer.status === "running" ? "暂停" : "继续"}>{timer.status === "running" ? <i className="pause-shape"/> : <i className="play-shape"/>}</button>
          {timer.kind === "focus" && <button className="timer-finish" onClick={onFinish}>完成，开始 {breakMinutes} 分钟休息</button>}
          {timer.kind !== "focus" && <button className="timer-finish quiet-finish" onClick={onFinish}>{timer.kind === "rest" ? "休息好了" : "完成冥想"}</button>}
          <button className="timer-cancel" onClick={onCancel}>{timer.kind === "focus" ? "结束且不休息" : "跳过"}</button>
        </div>
      </section>
    </main>
  );
}

function HistoryView({ state, now }: { state: AppState; now: number }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - index);
    const key = dayKey(date);
    const sessions = state.sessions.filter((session) => dayKey(new Date(session.completedAt)) === key);
    const focus = sessions.filter((session) => session.kind === "focus").reduce((sum, session) => sum + session.minutes, 0);
    const routineCount = Object.keys(state.days[key]?.routines ?? {}).length;
    return { key, date, focus, routineCount, sessionCount: sessions.filter((session) => session.kind === "focus").length };
  });
  const totalFocus = days.reduce((sum, day) => sum + day.focus, 0);
  return (
    <main className="history-layout">
      <section className="history-title"><span>LAST 7 DAYS</span><h1>最近七天</h1><p>这里只记录发生过的事，不给你制造新的压力。</p></section>
      <section className="history-summary"><div><span>专注时间</span><strong>{totalFocus}<small> 分钟</small></strong></div><div><span>完成段数</span><strong>{days.reduce((sum, day) => sum + day.sessionCount, 0)}<small> 段</small></strong></div><div><span>照顾日常</span><strong>{days.reduce((sum, day) => sum + day.routineCount, 0)}<small> 次</small></strong></div></section>
      <section className="week-list">
        {days.map((day) => (
          <article key={day.key}><time><strong>{day.date.getDate()}</strong><span>{new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(day.date)}</span></time><div className="day-bar"><i style={{ width: `${Math.min(100, day.focus / 1.8)}%` }}/></div><div><strong>{day.focus} 分钟</strong><span>{day.sessionCount} 段专注 · {day.routineCount} 项日常</span></div></article>
        ))}
      </section>
      <section className="recent-sessions"><div className="card-heading"><div><span>RECENT</span><h2>最近完成</h2></div></div>{state.sessions.slice(-8).reverse().map((session) => <article key={session.id}><i className={`session-dot is-${session.kind}`}/><div><strong>{session.label}</strong><span>{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(session.completedAt))}</span></div><b>{session.minutes} 分钟</b></article>)}</section>
    </main>
  );
}

function SettingsSheet({ draft, setDraft, system, onClose, onSave, onTestNotification }: {
  draft: Settings;
  setDraft: (settings: Settings) => void;
  system: SystemSettings;
  onClose: () => void;
  onSave: () => Promise<void>;
  onTestNotification: () => Promise<void>;
}) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft({ ...draft, [key]: value });
  return (
    <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header><div><span>只要和你的生活一致</span><h2 id="settings-title">我的一天</h2></div><button onClick={onClose} aria-label="关闭">×</button></header>
        <div className="settings-section"><h3>专注与休息</h3><label><span>默认专注</span><div><input type="number" min="5" max="180" step="5" value={draft.focusMinutes} onChange={(event) => update("focusMinutes", Number(event.target.value))}/><em>分钟</em></div></label><label><span>自动休息</span><div><input type="number" min="1" max="30" value={draft.breakMinutes} onChange={(event) => update("breakMinutes", Number(event.target.value))}/><em>分钟</em></div></label></div>
        <div className="settings-section"><h3>三餐与用药</h3>{(["breakfast", "lunch", "dinner"] as const).map((meal) => <label key={meal}><span>{meal === "breakfast" ? "早餐" : meal === "lunch" ? "午餐" : "晚餐"}</span><input type="time" value={draft.meals[meal]} onChange={(event) => update("meals", { ...draft.meals, [meal]: event.target.value })}/></label>)}<label><span>饭后提醒</span><div><input type="number" min="0" max="180" step="5" value={draft.medicationOffset} onChange={(event) => update("medicationOffset", Number(event.target.value))}/><em>分钟</em></div></label><p>请按医生或药师给你的实际服用安排设置。墨流不提供用药判断。</p></div>
        <div className="settings-section"><h3>两次冥想与回顾</h3><label><span>工作中间</span><div><input type="time" value={draft.middayMeditation.time} onChange={(event) => update("middayMeditation", { ...draft.middayMeditation, time: event.target.value })}/><input className="short-number" type="number" min="1" max="30" value={draft.middayMeditation.minutes} onChange={(event) => update("middayMeditation", { ...draft.middayMeditation, minutes: Number(event.target.value) })}/><em>分</em></div></label><label><span>睡前</span><div><input type="time" value={draft.bedtimeMeditation.time} onChange={(event) => update("bedtimeMeditation", { ...draft.bedtimeMeditation, time: event.target.value })}/><input className="short-number" type="number" min="1" max="30" value={draft.bedtimeMeditation.minutes} onChange={(event) => update("bedtimeMeditation", { ...draft.bedtimeMeditation, minutes: Number(event.target.value) })}/><em>分</em></div></label><label><span>一天回顾</span><input type="time" value={draft.reviewTime} onChange={(event) => update("reviewTime", event.target.value)}/></label></div>
        <div className="settings-section system-settings"><h3>Windows 后台</h3><label className="switch-setting"><span><strong>开机后自动运行</strong><small>推荐开启，提醒才不依赖你手动打开</small></span><input type="checkbox" checked={draft.autoStart} onChange={(event) => update("autoStart", event.target.checked)}/><i/></label><label className="switch-setting"><span><strong>关闭窗口后留在托盘</strong><small>计时和提醒继续运行</small></span><input type="checkbox" checked={draft.minimizeToTray} onChange={(event) => update("minimizeToTray", event.target.checked)}/><i/></label><button className="notification-test" onClick={onTestNotification} disabled={!system.notificationsSupported}>测试系统提醒</button><p>版本 {system.version} · {system.packaged ? "已安装版本" : "开发验收版本"}</p></div>
        <div className="settings-actions"><button onClick={onClose}>取消</button><button onClick={onSave}>保存设置</button></div>
      </section>
    </div>
  );
}

function ReviewSheet({ draft, setDraft, onClose, onSave }: { draft: Review; setDraft: (review: Review) => void; onClose: () => void; onSave: () => void }) {
  return <div className="modal-layer review-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="review-panel" role="dialog" aria-modal="true" aria-labelledby="review-title"><header><div><span>不用写得完整</span><h2 id="review-title">收好今天</h2></div><button onClick={onClose} aria-label="关闭">×</button></header><label><span>今天完成了什么？</span><textarea rows={3} value={draft.completed} onChange={(event) => setDraft({ ...draft, completed: event.target.value })} placeholder="哪怕只写一件"/></label><label><span>还有什么没做？</span><textarea rows={2} value={draft.unfinished} onChange={(event) => setDraft({ ...draft, unfinished: event.target.value })} placeholder="留给明天，不留在脑子里"/></label><label><span>今天最后一句话</span><input value={draft.result} onChange={(event) => setDraft({ ...draft, result: event.target.value })} placeholder="今天到这里就够了"/></label><button className="review-save" onClick={onSave}>保存今天</button></section></div>;
}
