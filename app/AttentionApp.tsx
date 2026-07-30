"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearLocalData,
  fetchRemote,
  flushQueue,
  loadCache,
  mergeSessions,
  postAction,
  queueAction,
  removeQueued,
  saveCache,
} from "./attention/store";
import type {
  AttentionEvent,
  AttentionSession,
  Energy,
  EventKind,
  Outcome,
  SyncAction,
  Viewer,
} from "./attention/types";

type View = "now" | "today" | "patterns" | "settings";
type SyncState = "loading" | "synced" | "local" | "syncing";

const ENERGY_OPTIONS: { value: Energy; label: string; short: string }[] = [
  { value: "clear", label: "很清醒", short: "清醒" },
  { value: "steady", label: "还稳定", short: "稳定" },
  { value: "scattered", label: "有点散", short: "分散" },
  { value: "tired", label: "很疲惫", short: "疲惫" },
];

const TARGET_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "不设时限" },
  { value: 10, label: "10 分钟" },
  { value: 25, label: "25 分钟" },
  { value: 45, label: "45 分钟" },
];

const EVENT_COPY: Record<EventKind, { label: string; past: string }> = {
  drift: { label: "我走神了", past: "走神" },
  interrupt: { label: "被打断了", past: "被打断" },
  idea: { label: "有个念头", past: "出现念头" },
  recovery: { label: "我想缓一下", past: "开始恢复" },
  return: { label: "我回来了", past: "回到原处" },
};

const OUTCOME_OPTIONS: { value: Outcome; title: string; detail: string }[] = [
  { value: "complete", title: "完成了", detail: "这一段有清楚的终点" },
  { value: "progress", title: "推进了一点", detail: "没有完成，但方向更清楚" },
  { value: "pause", title: "先放下", detail: "如实结束，不算失败" },
];

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function sameDay(iso: string, date = new Date()) {
  const value = new Date(iso);
  return value.getFullYear() === date.getFullYear() && value.getMonth() === date.getMonth() && value.getDate() === date.getDate();
}

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function durationMinutes(session: AttentionSession, now: number) {
  const end = session.endedAt ? new Date(session.endedAt).getTime() : now;
  return Math.max(0, Math.round((end - new Date(session.startedAt).getTime()) / 60000));
}

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(date);
}

function energyLabel(value: Energy | null) {
  return ENERGY_OPTIONS.find((item) => item.value === value)?.short ?? "未记录";
}

function outcomeLabel(value: Outcome | null) {
  return OUTCOME_OPTIONS.find((item) => item.value === value)?.title ?? "进行中";
}

function adviceFor(energy: Energy, current?: AttentionSession) {
  const drifts = current?.events.filter((event) => event.kind === "drift").length ?? 0;
  const interrupts = current?.events.filter((event) => event.kind === "interrupt").length ?? 0;
  const last = current?.events.at(-1)?.kind;
  if (drifts >= 2) return "这一段已经两次散开。别再加力：把目标缩成五分钟能完成的一小步。";
  if (last === "interrupt") return "打断已经被记下。回来先把当前目标默念一遍，再碰其他事情。";
  if (interrupts > 0 && last === "return") return "你已经回来，不用补偿刚才失去的时间；只继续眼前这一小步。";
  if (energy === "tired") return "今天不用证明意志力。先做五分钟摸底，状态没有回来就如实结束。";
  if (energy === "scattered") return "先别要求自己立刻专注。关掉一个多余入口，只留下这件事。";
  if (energy === "clear") return "状态正清楚。把可能打断你的东西先放远，再完整做这一段。";
  return "不用把整天安排好。现在只守住写下来的这一件事。";
}

function Icon({ name }: { name: "now" | "today" | "patterns" | "settings" | "arrow" | "close" | "cloud" | "download" | "trash" | "spark" }) {
  const content: Record<string, React.ReactNode> = {
    now: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3"/></>,
    today: <><path d="M5 4v16M19 4v16"/><path d="M5 8h5l2 3 2-2h5M5 16h4l2-2 3 2h5"/></>,
    patterns: <><path d="M4 18 9 9l4 5 3-7 4 11"/><path d="M3 21h18"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a2 2 0 0 0 .4 2.2l-2.6 2.6A2 2 0 0 0 15 19.4a2 2 0 0 0-1.2 1.8h-3.6A2 2 0 0 0 9 19.4a2 2 0 0 0-2.2.4l-2.6-2.6A2 2 0 0 0 4.6 15a2 2 0 0 0-1.8-1.2v-3.6A2 2 0 0 0 4.6 9a2 2 0 0 0-.4-2.2l2.6-2.6A2 2 0 0 0 9 4.6a2 2 0 0 0 1.2-1.8h3.6A2 2 0 0 0 15 4.6a2 2 0 0 0 2.2-.4l2.6 2.6A2 2 0 0 0 19.4 9a2 2 0 0 0 1.8 1.2v3.6A2 2 0 0 0 19.4 15Z"/></>,
    arrow: <><path d="M5 12h13"/><path d="m14 7 5 5-5 5"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    cloud: <path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6.1 8.5 4.8 4.8 0 0 0 7 18Z"/>,
    download: <><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M5 20h14"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    spark: <><path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24">{content[name]}</svg>;
}

function InkRiver({ session, now }: { session: AttentionSession; now: number }) {
  const start = new Date(session.startedAt).getTime();
  const end = session.endedAt ? new Date(session.endedAt).getTime() : now;
  const span = Math.max(1000, end - start);
  return (
    <div className="ink-river" aria-label={`这一段有 ${session.events.length} 个注意力事件`}>
      <svg viewBox="0 0 1000 88" preserveAspectRatio="none" aria-hidden="true">
        <path className="river-shadow" d="M0 45 C140 15 250 70 390 41 S650 18 1000 44"/>
        <path className="river-current" d="M0 45 C140 15 250 70 390 41 S650 18 1000 44"/>
      </svg>
      {session.events.map((event) => {
        const position = Math.max(2, Math.min(98, ((new Date(event.createdAt).getTime() - start) / span) * 100));
        return <span key={event.id} className={`river-event event-${event.kind}`} style={{ left: `${position}%` }} title={`${EVENT_COPY[event.kind].past} · ${timeLabel(event.createdAt)}`}/>;
      })}
      {!session.endedAt && <span className="river-live"/>}
    </div>
  );
}

export function AttentionApp({ viewer }: { viewer: Viewer }) {
  const [view, setView] = useState<View>("now");
  const [sessions, setSessions] = useState<AttentionSession[]>(() => loadCache());
  const [hydrated] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [notice, setNotice] = useState("");
  const [intention, setIntention] = useState("");
  const [energy, setEnergy] = useState<Energy>("steady");
  const [target, setTarget] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date().getTime());
  const [endOpen, setEndOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("progress");
  const [energyEnd, setEnergyEnd] = useState<Energy>("steady");
  const [endNote, setEndNote] = useState("");
  const [recoveryStart, setRecoveryStart] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const syncChain = useRef<Promise<void>>(Promise.resolve());

  const active = useMemo(() => sessions.find((session) => session.status === "active") ?? null, [sessions]);
  const todaySessions = useMemo(() => sessions.filter((session) => sameDay(session.startedAt)).sort((a, b) => a.startedAt.localeCompare(b.startedAt)), [sessions]);
  const todayEvents = useMemo(() => todaySessions.flatMap((session) => session.events), [todaySessions]);

  const runSync = useCallback((showNotice = false) => {
    if (!navigator.onLine) {
      setSyncState("local");
      if (showNotice) setNotice("当前离线，记录已安全留在这台设备，联网后会继续同步。");
      return;
    }
    setSyncState("syncing");
    syncChain.current = syncChain.current.then(async () => {
      try {
        await flushQueue();
        const remote = await fetchRemote();
        setSessions((current) => mergeSessions(current, remote));
        setSyncState("synced");
      } catch (error) {
        setSyncState("local");
        if (showNotice) setNotice(error instanceof Error ? `${error.message}；本地记录没有丢失。` : "暂时无法同步；本地记录没有丢失。");
      }
    });
  }, []);

  const enqueue = useCallback((action: SyncAction) => {
    queueAction(action);
    setSyncState("syncing");
    syncChain.current = syncChain.current.then(async () => {
      try {
        await postAction(action);
        removeQueued(action.key);
        setSyncState("synced");
      } catch {
        setSyncState("local");
      }
    });
  }, []);

  const changeView = useCallback((next: View) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => runSync(false), 0);
    return () => window.clearTimeout(timer);
  }, [runSync]);

  useEffect(() => {
    if (hydrated) saveCache(sessions);
  }, [hydrated, sessions]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), recoveryStart ? 250 : 1000);
    return () => window.clearInterval(interval);
  }, [recoveryStart]);

  useEffect(() => {
    const online = () => runSync(true);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [runSync]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  const mutateSession = useCallback((id: string, update: (session: AttentionSession) => AttentionSession) => {
    setSessions((current) => current.map((session) => session.id === id ? update(session) : session));
  }, []);

  const startSession = (event: FormEvent) => {
    event.preventDefault();
    const clean = intention.trim();
    if (!clean) return setNotice("先写一句：你现在真正要做什么？");
    if (active) return setNotice("先结束正在进行的这一段，再开始新的记录。");
    const startedAt = new Date().toISOString();
    const session: AttentionSession = {
      id: makeId("s"), intention: clean, energyStart: energy, energyEnd: null, targetMinutes: target,
      startedAt, endedAt: null, outcome: null, note: null, status: "active", updatedAt: startedAt, events: [],
    };
    setSessions((current) => [session, ...current]);
    enqueue({ key: `start:${session.id}`, action: "start", session: { id: session.id, intention: session.intention, energyStart: session.energyStart, targetMinutes: session.targetMinutes, startedAt } });
    setIntention("");
    setNotice("这一刻已经开始记录。之后走神、被打断或需要缓一缓，都可以直接点一下。");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const recordEvent = (kind: EventKind) => {
    if (!active) return;
    const createdAt = new Date().toISOString();
    const item: AttentionEvent = { id: makeId("e"), sessionId: active.id, kind, note: null, createdAt };
    mutateSession(active.id, (session) => ({ ...session, updatedAt: createdAt, events: [...session.events, item] }));
    enqueue({ key: `event:${item.id}`, action: "event", event: item });
    if (kind === "drift") setNotice("走神已经记下。不是失败；先关掉一个入口，再回到这句话。");
    if (kind === "interrupt") setNotice("打断已经记下。处理完后点“我回来了”，不用重新计划。");
    if (kind === "idea") setNotice("念头已经记下。现在不用追它，继续眼前这一件事。");
    if (kind === "recovery") setRecoveryStart(new Date().getTime());
    if (kind === "return") setNotice("你回来了。继续原来的最小一步，不补偿刚才失去的时间。");
  };

  const finishRecovery = () => {
    setRecoveryStart(null);
    recordEvent("return");
  };

  const finishSession = () => {
    if (!active) return;
    const endedAt = new Date().toISOString();
    mutateSession(active.id, (session) => ({
      ...session, endedAt, status: "completed", outcome, energyEnd, note: endNote.trim() || null, updatedAt: endedAt,
    }));
    enqueue({ key: `finish:${active.id}`, action: "finish", id: active.id, endedAt, outcome, energyEnd, note: endNote.trim() || undefined });
    setEndOpen(false);
    setEndNote("");
    changeView("today");
    setNotice("这一段已经如实收好。你现在看到的是今天，而不是一个分数。");
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), sessions }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `墨流记录-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    const action: SyncAction = { key: `clear:${Date.now()}`, action: "clear" };
    clearLocalData();
    setSessions([]);
    queueAction(action);
    enqueue(action);
    setConfirmClear(false);
    changeView("now");
    setNotice("这份记录已从当前设备清空，并正在从云端删除。");
  };

  const completedMinutes = todaySessions.reduce((total, session) => total + durationMinutes(session, now), 0);
  const interruptions = todayEvents.filter((event) => event.kind === "interrupt" || event.kind === "drift").length;
  const returns = todayEvents.filter((event) => event.kind === "return").length;
  const sevenDays = sessions.filter((session) => new Date(session.startedAt).getTime() >= now - 7 * 86400000);
  const recordedDays = new Set(sevenDays.map((session) => new Date(session.startedAt).toDateString())).size;
  const allBreaks = sevenDays.flatMap((session) => session.events).filter((event) => event.kind === "drift" || event.kind === "interrupt").length;
  const allReturns = sevenDays.flatMap((session) => session.events).filter((event) => event.kind === "return").length;
  const returnRate = allBreaks ? Math.min(100, Math.round((allReturns / allBreaks) * 100)) : 0;

  const hourGroups = sevenDays.filter((session) => session.status === "completed").reduce<Record<number, { count: number; positive: number }>>((groups, session) => {
    const hour = new Date(session.startedAt).getHours();
    groups[hour] ??= { count: 0, positive: 0 };
    groups[hour].count += 1;
    if (session.outcome !== "pause") groups[hour].positive += 1;
    return groups;
  }, {});
  const bestHour = Object.entries(hourGroups).filter(([, value]) => value.count >= 2).sort((a, b) => (b[1].positive / b[1].count) - (a[1].positive / a[1].count))[0];

  const recoveryElapsed = recoveryStart ? Math.max(0, now - recoveryStart) : 0;
  const breathSecond = (recoveryElapsed / 1000) % 12;
  const breathCopy = breathSecond < 4 ? "慢慢吸气" : breathSecond < 6 ? "停一下" : "把气呼完";

  const navItems: { id: View; label: string; icon: "now" | "today" | "patterns" | "settings" }[] = [
    { id: "now", label: "此刻", icon: "now" },
    { id: "today", label: "今天", icon: "today" },
    { id: "patterns", label: "规律", icon: "patterns" },
    { id: "settings", label: "设置", icon: "settings" },
  ];

  return (
    <div className="attention-app">
      <a className="skip-link" href="#main">跳到主要内容</a>
      <aside className="app-sidebar">
        <button className="brand-lockup" onClick={() => changeView("now")} aria-label="回到墨流此刻页">
          <span className="brand-mark" aria-hidden="true"><i/><i/><i/></span><strong>墨流</strong><small>INKFLOW</small>
        </button>
        <nav aria-label="主导航">
          {navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => changeView(item.id)}><Icon name={item.icon}/><span>{item.label}</span>{item.id === "now" && active && <i className="nav-live"/>}</button>)}
        </nav>
        <div className="sidebar-foot">
          <span className={`sync-pill is-${syncState}`}><i/><span>{syncState === "synced" ? "已同步" : syncState === "syncing" || syncState === "loading" ? "同步中" : "本机安全保存"}</span></span>
          <p>不监控你去了哪里。<br/>只记录你主动留下的事实。</p>
        </div>
      </aside>

      <main id="main" className="app-main">
        <header className="app-header">
          <div><span>{dayLabel(new Date(now))}</span><i/></div>
          <div className="header-right"><span>{active ? "有一段正在发生" : todaySessions.length ? `今天已有 ${todaySessions.length} 段` : "今天还没有记录"}</span><button onClick={() => runSync(true)} aria-label="立即同步"><Icon name="cloud"/></button></div>
        </header>

        {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="关闭提示"><Icon name="close"/></button></div>}

        {view === "now" && (
          <section className="now-view page-enter">
            {!active ? (
              <div className="now-empty">
                <div className="now-intro">
                  <p className="kicker"><span/>此刻 / NOW</p>
                  <h1>你现在，<br/>把注意力放在哪里？</h1>
                  <p className="page-lede">不用先安排好整天。写下眼前这一件事，墨流从这一刻开始替你留下真实轨迹。</p>
                  <div className="today-whisper">
                    <span>今天</span><strong>{todaySessions.length ? `${todaySessions.length} 段真实记录` : "从第一句话开始"}</strong><small>{todaySessions.length ? `${completedMinutes} 分钟 · ${interruptions} 次散开 · ${returns} 次回来` : "不评分，不打卡，不要求连续"}</small>
                  </div>
                </div>
                <form className="start-card" onSubmit={startSession}>
                  <div className="card-index">01</div>
                  <label className="intention-field">
                    <span>我现在要做</span>
                    <textarea value={intention} onChange={(event) => setIntention(event.target.value)} autoFocus maxLength={160} rows={3} placeholder="例如：把这章读完三页，弄懂作者的核心判断"/>
                    <small>{intention.length}/160</small>
                  </label>
                  <fieldset>
                    <legend>脑子现在怎么样？</legend>
                    <div className="choice-row energy-row">
                      {ENERGY_OPTIONS.map((item) => <button type="button" key={item.value} aria-pressed={energy === item.value} onClick={() => setEnergy(item.value)}>{item.label}</button>)}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>这次要不要一个时间边界？</legend>
                    <div className="choice-row target-row">
                      {TARGET_OPTIONS.map((item) => <button type="button" key={String(item.value)} aria-pressed={target === item.value} onClick={() => setTarget(item.value)}>{item.label}</button>)}
                    </div>
                  </fieldset>
                  <div className="instant-advice"><Icon name="spark"/><p><span>墨流此刻建议</span>{adviceFor(energy)}</p></div>
                  <button className="primary-button" type="submit"><span>开始记录这一段</span><Icon name="arrow"/></button>
                  <p className="form-proof">只要这一句话就能开始。时间可以不设。</p>
                </form>
              </div>
            ) : (
              <div className="active-view">
                <div className="active-heading">
                  <p className="kicker"><span className="live-dot"/>正在发生 / LIVE</p>
                  <p className="elapsed">{formatDuration(now - new Date(active.startedAt).getTime())}</p>
                  <h1>{active.intention}</h1>
                  <div className="active-meta"><span>{timeLabel(active.startedAt)} 开始</span><i/><span>开始时：{energyLabel(active.energyStart)}</span><i/><span>{active.targetMinutes ? `边界 ${active.targetMinutes} 分钟` : "不设时限"}</span></div>
                </div>
                <InkRiver session={active} now={now}/>
                <div className="live-grid">
                  <section className="event-capture">
                    <div className="section-title"><span>发生了什么，就点一下</span><small>不会停止这一段</small></div>
                    <div className="event-buttons">
                      {(["drift", "interrupt", "idea", "recovery"] as EventKind[]).map((kind, index) => <button key={kind} onClick={() => recordEvent(kind)}><i>0{index + 1}</i><span>{EVENT_COPY[kind].label}</span></button>)}
                    </div>
                    {active.events.length > 0 && <div className="latest-event"><span>最近</span><strong>{EVENT_COPY[active.events.at(-1)!.kind].past}</strong><small>{timeLabel(active.events.at(-1)!.createdAt)}</small>{["drift", "interrupt"].includes(active.events.at(-1)!.kind) && <button onClick={() => recordEvent("return")}>我回来了</button>}</div>}
                  </section>
                  <aside className="live-advice">
                    <div><Icon name="spark"/><span>现在最有用的一步</span></div>
                    <p>{adviceFor(active.energyStart, active)}</p>
                    <button className="secondary-button" onClick={() => { setEnergyEnd(active.energyStart); setEndOpen(true); }}>结束这一段</button>
                  </aside>
                </div>
              </div>
            )}
          </section>
        )}

        {view === "today" && (
          <section className="today-view page-enter">
            <div className="page-heading"><p className="kicker"><span/>今天 / TODAY</p><h1>不是成绩单，<br/>是你真实的一天。</h1><p>看见注意力去了哪里，比逼自己一直专注更有用。</p></div>
            <div className="today-stats">
              <article><span>已记录</span><strong>{completedMinutes}<small>分钟</small></strong><p>包含正在发生的这一段</p></article>
              <article><span>自然散开</span><strong>{interruptions}<small>次</small></strong><p>走神和外部打断</p></article>
              <article><span>主动回来</span><strong>{returns}<small>次</small></strong><p>这比“从不走神”更真实</p></article>
            </div>
            <div className="day-river-card">
              <div className="section-title"><span>今日注意力流</span><small>{todaySessions.length ? `${timeLabel(todaySessions[0].startedAt)} 至现在` : "等待第一条记录"}</small></div>
              {todaySessions.length ? <div className="day-river">{todaySessions.map((session) => <div key={session.id} className={`day-segment outcome-${session.outcome ?? "active"}`} style={{ flexGrow: Math.max(1, durationMinutes(session, now)) }} title={session.intention}><i/>{session.events.map((event) => <b key={event.id} className={`event-${event.kind}`}/>)}</div>)}</div> : <div className="empty-river"><span/><p>今天还没有轨迹。不是落后，只是还没开始记录。</p></div>}
              <div className="river-legend"><span><i className="steady"/>一段意图</span><span><i className="break"/>散开或打断</span><span><i className="back"/>回来</span></div>
            </div>
            <div className="timeline-heading"><h2>每一段</h2><button onClick={() => changeView("now")}>{active ? "回到正在发生" : "记录新的此刻"}<Icon name="arrow"/></button></div>
            <div className="session-list">
              {todaySessions.length === 0 ? <div className="empty-state"><span>一</span><h3>你不需要补记过去。</h3><p>从现在开始，就是完整的一天。</p><button className="primary-button" onClick={() => changeView("now")}>写下此刻 <Icon name="arrow"/></button></div> : [...todaySessions].reverse().map((session, index) => (
                <article key={session.id} className="session-row">
                  <div className="session-number">{String(todaySessions.length - index).padStart(2, "0")}</div>
                  <div className="session-time"><strong>{timeLabel(session.startedAt)}</strong><span>{session.endedAt ? timeLabel(session.endedAt) : "现在"}</span></div>
                  <div className="session-body"><h3>{session.intention}</h3><p>{session.status === "active" ? adviceFor(session.energyStart, session) : session.note || `${outcomeLabel(session.outcome)} · 结束时${energyLabel(session.energyEnd)}`}</p><div>{session.events.map((event) => <span key={event.id} className={`event-tag event-${event.kind}`}>{EVENT_COPY[event.kind].past}</span>)}</div></div>
                  <div className="session-result"><strong>{durationMinutes(session, now)}</strong><span>分钟</span><small>{outcomeLabel(session.outcome)}</small></div>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === "patterns" && (
          <section className="patterns-view page-enter">
            <div className="page-heading"><p className="kicker"><span/>规律 / PATTERNS</p><h1>墨流先观察，<br/>再给建议。</h1><p>没有足够记录时，我们不会编造一个“最懂你的算法”。</p></div>
            {recordedDays < 3 ? (
              <div className="learning-card">
                <div className="learning-orbit"><span>{recordedDays}</span><small>/ 3 天</small></div>
                <div><p className="kicker">还不够了解你</p><h2>再自然地记录 {3 - recordedDays} 天。</h2><p>不需要刻意提高数据。照常开始、走神、回来和结束，真实比完整更重要。</p><button className="primary-button" onClick={() => changeView("now")}>回到此刻 <Icon name="arrow"/></button></div>
              </div>
            ) : (
              <>
                <div className="pattern-grid">
                  <article className="pattern-primary"><span>近七天最稳定的发现</span><h2>{bestHour ? `${String(bestHour[0]).padStart(2, "0")}:00 前后，你更容易推进事情。` : "你的记录时段还比较分散。"}</h2><p>{bestHour ? `这个时段已有 ${bestHour[1].count} 条记录支持；建议把最需要清醒判断的一步留给它。` : "先不要强行建立固定作息。再记录几个自然发生的时段，规律会更可靠。"}</p></article>
                  <article><span>散开之后的回来</span><strong>{returnRate}<small>%</small></strong><p>{allBreaks ? `${allBreaks} 次散开中，有 ${allReturns} 次主动记录了回来。` : "还没有记录走神或打断。"}</p></article>
                  <article><span>真实记录密度</span><strong>{sevenDays.length}<small>段</small></strong><p>来自 {recordedDays} 个不同日子，不计算连续签到。</p></article>
                </div>
                <div className="evidence-advice"><Icon name="spark"/><div><span>下一条有依据的建议</span><h2>{allBreaks > allReturns ? "下一次被打断后，只增加一个动作：回来时点一下“我回来了”。" : "你已经会回来。接下来别追求更长，只观察哪种开始状态更容易推进。"}</h2><p>依据：近七天 {allBreaks} 次散开 / {allReturns} 次主动回来。</p></div></div>
              </>
            )}
          </section>
        )}

        {view === "settings" && (
          <section className="settings-view page-enter">
            <div className="page-heading"><p className="kicker"><span/>设置 / SETTINGS</p><h1>记录属于你，<br/>不是平台的燃料。</h1><p>墨流只保存你主动写下或点击的内容，不读取浏览记录、屏幕或其他应用。</p></div>
            <div className="settings-grid">
              <section className="account-card"><div className="settings-icon"><Icon name="cloud"/></div><div><span>账户与同步</span><h2>{viewer ? viewer.displayName : "尚未登录"}</h2><p>{viewer ? `${viewer.email} · D1 加密传输与云端持久保存` : "当前记录会先安全留在本机。登录后才能跨设备保存。"}</p></div>{viewer ? <span className={`sync-badge is-${syncState}`}>{syncState === "synced" ? "已同步" : syncState === "syncing" ? "同步中" : "等待联网"}</span> : <a className="secondary-button" href="/signin-with-chatgpt?return_to=%2F">登录同步</a>}</section>
              <section className="setting-row"><div><span>导出</span><h3>拿走完整记录</h3><p>下载结构化 JSON，包含每一段和主动事件。</p></div><button className="icon-button" onClick={exportData}><Icon name="download"/><span>导出数据</span></button></section>
              <section className="setting-row"><div><span>隐私边界</span><h3>不自动监控注意力</h3><p>墨流不会根据切换页面或长时间不操作，擅自判断你走神。</p></div><strong className="privacy-stamp">USER RECORDED</strong></section>
              <section className="setting-row danger-row"><div><span>删除</span><h3>清空全部墨流记录</h3><p>将删除这台设备与当前账户云端保存的数据，无法撤销。</p></div>{confirmClear ? <div className="confirm-actions"><button onClick={() => setConfirmClear(false)}>取消</button><button className="danger-button" onClick={clearAll}>确认清空</button></div> : <button className="icon-button danger-button" onClick={() => setConfirmClear(true)}><Icon name="trash"/><span>清空记录</span></button>}</section>
            </div>
          </section>
        )}
      </main>

      {endOpen && active && <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEndOpen(false); }}><section className="end-sheet" role="dialog" aria-modal="true" aria-labelledby="end-title"><header><div><p className="kicker">收好这一段 / CLOSE</p><h2 id="end-title">结束时，你在哪里？</h2></div><button onClick={() => setEndOpen(false)} aria-label="关闭"><Icon name="close"/></button></header><div className="outcome-grid">{OUTCOME_OPTIONS.map((item) => <button key={item.value} aria-pressed={outcome === item.value} onClick={() => setOutcome(item.value)}><strong>{item.title}</strong><span>{item.detail}</span></button>)}</div><fieldset><legend>现在的状态</legend><div className="choice-row energy-row">{ENERGY_OPTIONS.map((item) => <button type="button" key={item.value} aria-pressed={energyEnd === item.value} onClick={() => setEnergyEnd(item.value)}>{item.label}</button>)}</div></fieldset><label className="closing-note"><span>留一句给之后的自己（可不填）</span><textarea value={endNote} onChange={(event) => setEndNote(event.target.value)} rows={2} maxLength={240} placeholder="例如：下次从第三段的反例继续，不用重读前面"/></label><button className="primary-button" onClick={finishSession}><span>收好并看见今天</span><Icon name="arrow"/></button></section></div>}

      {recoveryStart && active && <div className="recovery-layer" role="dialog" aria-modal="true" aria-labelledby="recovery-title"><button className="recovery-close" onClick={finishRecovery} aria-label="结束恢复"><Icon name="close"/></button><div className="breath-stage"><div className="breath-orbit"><span/></div><p className="kicker">九十秒恢复 / 不计成绩</p><h2 id="recovery-title">{breathCopy}</h2><p>视线离开屏幕也可以。墨流会保留：<strong>{active.intention}</strong></p><div className="recovery-time">{formatDuration(recoveryElapsed)} <span>/ 01:30</span></div><button className="secondary-button" onClick={finishRecovery}>我已经缓过来</button></div></div>}
    </div>
  );
}
