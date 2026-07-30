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
  EventKind,
  SyncAction,
  Viewer,
} from "./attention/types";

type View = "now" | "timeline" | "insights";
type SyncState = "loading" | "synced" | "local" | "syncing";
type IconName = "now" | "timeline" | "insights" | "settings" | "cloud" | "download" | "trash" | "close" | "interrupt" | "idea" | "rest";

const EVENT_COPY: Record<EventKind, { action: string; past: string }> = {
  drift: { action: "散开", past: "散开" },
  interrupt: { action: "被打断", past: "被打断" },
  idea: { action: "留个念头", past: "一个念头" },
  recovery: { action: "缓一下", past: "短暂恢复" },
  return: { action: "我回来了", past: "回来" },
};

const ICONS: Record<IconName, string> = {
  now: "●",
  timeline: "≋",
  insights: "✦",
  settings: "···",
  cloud: "↥",
  download: "↓",
  trash: "×",
  close: "×",
  interrupt: "↯",
  idea: "·",
  rest: "◌",
};

function Icon({ name }: { name: IconName }) {
  return <span className={`glyph glyph-${name}`} aria-hidden="true">{ICONS[name]}</span>;
}

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

function durationLabel(session: AttentionSession, now: number) {
  const minutes = durationMinutes(session, now);
  return minutes < 1 ? "不到 1 分钟" : `${minutes} 分钟`;
}

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(date);
}

function FlowRail({ session, now }: { session: AttentionSession; now: number }) {
  const start = new Date(session.startedAt).getTime();
  const end = session.endedAt ? new Date(session.endedAt).getTime() : now;
  const span = Math.max(1000, end - start);
  return (
    <div className="flow-rail" aria-label={`这一段留下了 ${session.events.length} 个注意力事件`}>
      <span className="flow-track"/>
      {session.events.map((event) => {
        const position = Math.max(2, Math.min(98, ((new Date(event.createdAt).getTime() - start) / span) * 100));
        return <i key={event.id} className={`flow-event event-${event.kind}`} style={{ left: `${position}%` }} title={`${EVENT_COPY[event.kind].past} · ${timeLabel(event.createdAt)}`}/>;
      })}
      {!session.endedAt && <span className="flow-live"/>}
    </div>
  );
}

export function AttentionApp({ viewer }: { viewer: Viewer }) {
  const [view, setView] = useState<View>("now");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessions, setSessions] = useState<AttentionSession[]>(() => loadCache());
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [notice, setNotice] = useState("");
  const [intention, setIntention] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [pulseTick, setPulseTick] = useState(0);
  const [recoveryStart, setRecoveryStart] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const syncChain = useRef<Promise<void>>(Promise.resolve());

  const active = useMemo(() => sessions.find((session) => session.status === "active") ?? null, [sessions]);
  const todaySessions = useMemo(() => sessions.filter((session) => sameDay(session.startedAt)).sort((a, b) => a.startedAt.localeCompare(b.startedAt)), [sessions]);
  const todayEvents = useMemo(() => todaySessions.flatMap((session) => session.events), [todaySessions]);

  const runSync = useCallback((showNotice = false) => {
    if (!navigator.onLine) {
      setSyncState("local");
      if (showNotice) setNotice("离线也没关系，刚才的记录已经留在这台设备上。");
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
        if (showNotice) setNotice(error instanceof Error ? `${error.message}；本机记录仍然安全。` : "暂时无法同步；本机记录仍然安全。");
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

  useEffect(() => {
    const timer = window.setTimeout(() => runSync(false), 0);
    return () => window.clearTimeout(timer);
  }, [runSync]);

  useEffect(() => saveCache(sessions), [sessions]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
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

  const changeView = useCallback((next: View) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const mutateSession = useCallback((id: string, update: (session: AttentionSession) => AttentionSession) => {
    setSessions((current) => current.map((session) => session.id === id ? update(session) : session));
  }, []);

  const startSession = (event: FormEvent) => {
    event.preventDefault();
    if (active) return;
    const startedAt = new Date().toISOString();
    const session: AttentionSession = {
      id: makeId("s"),
      intention: intention.trim() || "留在此刻",
      energyStart: "steady",
      energyEnd: null,
      targetMinutes: null,
      startedAt,
      endedAt: null,
      outcome: null,
      note: null,
      status: "active",
      updatedAt: startedAt,
      events: [],
    };
    setSessions((current) => [session, ...current]);
    enqueue({ key: `start:${session.id}`, action: "start", session: { id: session.id, intention: session.intention, energyStart: session.energyStart, targetMinutes: null, startedAt } });
    setIntention("");
    setNotice("开始了。接下来不用证明专注，只在意识到时回来。");
  };

  const recordEvent = (kind: EventKind) => {
    if (!active) return;
    const createdAt = new Date().toISOString();
    const item: AttentionEvent = { id: makeId("e"), sessionId: active.id, kind, note: null, createdAt };
    mutateSession(active.id, (session) => ({ ...session, updatedAt: createdAt, events: [...session.events, item] }));
    enqueue({ key: `event:${item.id}`, action: "event", event: item });
    if (kind === "interrupt") setNotice("打断已记下。回来时，仍然只点中间那一下。");
    if (kind === "idea") setNotice("念头放在这里了，不用现在跟着它走。");
    if (kind === "recovery") setRecoveryStart(Date.now());
  };

  const recordReturnPulse = () => {
    if (!active) return;
    const base = Date.now();
    const drift: AttentionEvent = { id: makeId("e"), sessionId: active.id, kind: "drift", note: null, createdAt: new Date(base).toISOString() };
    const returned: AttentionEvent = { id: makeId("e"), sessionId: active.id, kind: "return", note: null, createdAt: new Date(base + 400).toISOString() };
    mutateSession(active.id, (session) => ({ ...session, updatedAt: returned.createdAt, events: [...session.events, drift, returned] }));
    enqueue({ key: `event:${drift.id}`, action: "event", event: drift });
    enqueue({ key: `event:${returned.id}`, action: "event", event: returned });
    setPulseTick((value) => value + 1);
    setNotice("记下了：刚才散开，也主动回来了。");
  };

  const finishRecovery = () => {
    setRecoveryStart(null);
    recordEvent("return");
    setNotice("已经回来。继续眼前这一小步。");
  };

  const finishSession = () => {
    if (!active) return;
    const endedAt = new Date().toISOString();
    mutateSession(active.id, (session) => ({
      ...session,
      endedAt,
      outcome: "progress",
      energyEnd: session.energyStart,
      note: null,
      status: "completed",
      updatedAt: endedAt,
    }));
    enqueue({ key: `finish:${active.id}`, action: "finish", id: active.id, endedAt, outcome: "progress", energyEnd: active.energyStart });
    setNotice(`这一段已收好 · ${durationLabel(active, Date.now())}。`);
  };

  const exportData = () => {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), sessions }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `inkflow-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    clearLocalData();
    setSessions([]);
    setConfirmClear(false);
    setSettingsOpen(false);
    enqueue({ key: `clear:${Date.now()}`, action: "clear" });
    setNotice("记录已经清空。");
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
    if (session.outcome === "complete" || session.outcome === "progress") groups[hour].positive += 1;
    return groups;
  }, {});
  const bestHour = Object.entries(hourGroups).filter(([, value]) => value.count >= 2).sort((a, b) => (b[1].positive / b[1].count) - (a[1].positive / a[1].count))[0];

  const recoveryElapsed = recoveryStart ? Math.max(0, now - recoveryStart) : 0;
  const breathSecond = (recoveryElapsed / 1000) % 12;
  const breathCopy = breathSecond < 4 ? "慢慢吸气" : breathSecond < 6 ? "停一下" : "把气呼完";

  const syncLabel = syncState === "synced" ? "已同步" : syncState === "syncing" || syncState === "loading" ? "同步中" : "本机保存";

  return (
    <div className="inkflow-app">
      <a className="skip-link" href="#main">跳到主要内容</a>
      <div className="app-shell">
        <header className="topbar">
          <button className="brand-button" onClick={() => changeView("now")} aria-label="回到墨流此刻页">
            <span className="brand-drop" aria-hidden="true"><i/><i/></span>
            <span><strong>墨流</strong><small>{active ? "正在记录" : "注意力日志"}</small></span>
          </button>
          <div className="topbar-actions">
            <button className={`sync-state is-${syncState}`} onClick={() => runSync(true)} aria-label="立即同步"><i/>{syncLabel}</button>
            {active && <button className="finish-button" onClick={finishSession}><span>收好这一段</span><i/></button>}
            <button className="settings-button" onClick={() => setSettingsOpen(true)} aria-label="打开设置"><Icon name="settings"/></button>
          </div>
        </header>

        <main id="main" className={`app-content view-${view}`}>
          {notice && <div className="ambient-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="关闭提示"><Icon name="close"/></button></div>}

          {view === "now" && (
            <section className={`now-screen ${active ? "is-active" : "is-idle"}`}>
              {!active ? (
                <>
                  <div className="idle-copy">
                    <span className="eyebrow">{dayLabel(new Date())}</span>
                    <h1>先开始。<br/><em>其他以后再说。</em></h1>
                    <p>不填、不选，也能留下这一刻。</p>
                  </div>

                  <form className="start-console" onSubmit={startSession}>
                    <label className="intention-line">
                      <span>这次想守住什么？</span>
                      <input value={intention} onChange={(event) => setIntention(event.target.value)} maxLength={160} placeholder="可不填，默认记作“留在此刻”"/>
                    </label>
                    <button className="pulse-control start-control" type="submit" aria-label="一键开始记录">
                      <span className="pulse-rings" aria-hidden="true"><i/><i/><i/></span>
                      <span className="pulse-core"><small>一键</small><strong>开始</strong></span>
                    </button>
                    <p className="zero-friction-note">默认不设时限 · 不要求保持完美</p>
                  </form>

                  <div className="today-glance" aria-label="今天的记录摘要">
                    <div><span>今天</span><strong>{todaySessions.length}</strong><small>段</small></div>
                    <i/>
                    <div><span>已经回来</span><strong>{returns}</strong><small>次</small></div>
                    <button onClick={() => changeView("timeline")}>看轨迹 <span>→</span></button>
                  </div>
                </>
              ) : (
                <>
                  <header className="active-context">
                    <div><span className="live-indicator"><i/>正在发生</span><strong>{formatDuration(now - new Date(active.startedAt).getTime())}</strong></div>
                    <h1>{active.intention}</h1>
                    <p>{timeLabel(active.startedAt)} 开始 · 没有倒计时</p>
                  </header>

                  <FlowRail session={active} now={now}/>

                  <div className="return-stage">
                    <button key={pulseTick} className="pulse-control return-control" onClick={recordReturnPulse} aria-label="记录刚才散开并已经回来">
                      <span className="pulse-rings" aria-hidden="true"><i/><i/><i/></span>
                      <span className="pulse-core"><small>刚才散开了</small><strong>我回来了</strong></span>
                    </button>
                    <p>意识到的这一刻，已经是回来。</p>
                  </div>

                  <div className="context-strip" aria-label="其他即时记录">
                    <span>顺手记下</span>
                    <button onClick={() => recordEvent("interrupt")}><Icon name="interrupt"/><b>被打断</b></button>
                    <button onClick={() => recordEvent("idea")}><Icon name="idea"/><b>留个念头</b></button>
                    <button onClick={() => recordEvent("recovery")}><Icon name="rest"/><b>缓一下</b></button>
                  </div>
                </>
              )}
            </section>
          )}

          {view === "timeline" && (
            <section className="timeline-screen screen-enter">
              <header className="compact-heading">
                <div><span className="eyebrow">{dayLabel(new Date())}</span><h1>今天</h1><p>没有评分，只有实际发生过的轨迹。</p></div>
                <button onClick={() => changeView("now")}>{active ? "回到正在发生" : "开始新的一段"}<span>→</span></button>
              </header>

              <div className="metric-row">
                <article><span>留下</span><strong>{completedMinutes}<small>分钟</small></strong></article>
                <article><span>散开</span><strong>{interruptions}<small>次</small></strong></article>
                <article><span>回来</span><strong>{returns}<small>次</small></strong></article>
              </div>

              <div className="day-flow">
                <div className="day-flow-head"><span>今日流线</span><small>{todaySessions.length ? `${timeLabel(todaySessions[0].startedAt)} — 现在` : "等待第一段"}</small></div>
                {todaySessions.length ? <div className="day-flow-track">{todaySessions.map((session) => <span key={session.id} className={session.status === "active" ? "is-live" : ""} style={{ flexGrow: Math.max(1, durationMinutes(session, now)) }}><i/></span>)}</div> : <p className="empty-copy">从现在开始记录，就已经是完整的一天。</p>}
              </div>

              <div className="timeline-list">
                {todaySessions.length === 0 ? (
                  <button className="empty-timeline" onClick={() => changeView("now")}><span>＋</span><strong>留下今天的第一段</strong><small>只需点一次开始</small></button>
                ) : [...todaySessions].reverse().map((session) => (
                  <article key={session.id} className={`timeline-item ${session.status === "active" ? "is-live" : ""}`}>
                    <div className="timeline-time"><strong>{timeLabel(session.startedAt)}</strong><span>{session.endedAt ? timeLabel(session.endedAt) : "现在"}</span></div>
                    <div className="timeline-node"><i/></div>
                    <div className="timeline-card">
                      <header><div><span>{session.status === "active" ? "正在发生" : durationLabel(session, now)}</span><h2>{session.intention}</h2></div>{session.status === "active" && <b>LIVE</b>}</header>
                      <FlowRail session={session} now={now}/>
                      <div className="event-summary">
                        {session.events.length ? session.events.map((event) => <span key={event.id} className={`event-${event.kind}`}>{EVENT_COPY[event.kind].past}</span>) : <small>这一段没有额外记录</small>}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {view === "insights" && (
            <section className="insights-screen screen-enter">
              <header className="compact-heading">
                <div><span className="eyebrow">近七天</span><h1>洞察</h1><p>墨流先观察，再开口。</p></div>
              </header>
              {recordedDays < 3 ? (
                <article className="learning-panel">
                  <div className="learning-count"><strong>{recordedDays}</strong><span>/ 3 天</span></div>
                  <div><span>还不急着下结论</span><h2>再自然地用 {3 - recordedDays} 天。</h2><p>不用为了数据多做任何动作。照常开始，散开时点一下“我回来了”，墨流会自己学习。</p></div>
                </article>
              ) : (
                <div className="insight-stack">
                  <article className="primary-insight">
                    <span>目前最可信的一件事</span>
                    <h2>{bestHour ? `${String(bestHour[0]).padStart(2, "0")}:00 前后，你更容易把事情向前推。` : "你还没有固定的高效时段，这并不是问题。"}</h2>
                    <p>{bestHour ? `这个判断来自 ${bestHour[1].count} 段真实记录。可以把需要清醒判断的一步优先放到这个时段。` : "继续按真实生活记录，比强行建立作息更有价值。"}</p>
                  </article>
                  <div className="insight-pair">
                    <article><span>回来率</span><strong>{returnRate}<small>%</small></strong><p>{allBreaks} 次散开中，留下了 {allReturns} 次回来。</p></article>
                    <article><span>记录密度</span><strong>{sevenDays.length}<small>段</small></strong><p>来自 {recordedDays} 个不同日子，不计算连续签到。</p></article>
                  </div>
                </div>
              )}
            </section>
          )}
        </main>

        <nav className="bottom-nav" aria-label="主导航">
          <button className={view === "now" ? "is-active" : ""} onClick={() => changeView("now")}><Icon name="now"/><span>此刻</span>{active && <i/>}</button>
          <button className={view === "timeline" ? "is-active" : ""} onClick={() => changeView("timeline")}><Icon name="timeline"/><span>轨迹</span></button>
          <button className={view === "insights" ? "is-active" : ""} onClick={() => changeView("insights")}><Icon name="insights"/><span>洞察</span></button>
        </nav>
      </div>

      {settingsOpen && (
        <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <aside className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <header><div><span>偏好与数据</span><h2 id="settings-title">设置</h2></div><button onClick={() => setSettingsOpen(false)} aria-label="关闭设置"><Icon name="close"/></button></header>
            <section className="account-block"><Icon name="cloud"/><div><span>账户与同步</span><strong>{viewer ? viewer.displayName : "尚未登录"}</strong><p>{viewer ? `${viewer.email} · ${syncLabel}` : "当前记录先留在本机；登录后可跨设备同步。"}</p></div>{!viewer && <a href="/signin-with-chatgpt?return_to=%2F">登录</a>}</section>
            <button className="drawer-row" onClick={exportData}><Icon name="download"/><span><strong>导出完整记录</strong><small>下载为 JSON，数据始终属于你</small></span><b>→</b></button>
            <div className="drawer-row is-static"><span className="privacy-dot"/><span><strong>只记录你主动留下的事实</strong><small>不读取浏览记录、屏幕或其他应用</small></span></div>
            {confirmClear ? <div className="clear-confirm"><p>清空后无法撤销。</p><button onClick={() => setConfirmClear(false)}>取消</button><button onClick={clearAll}>确认清空</button></div> : <button className="drawer-row danger" onClick={() => setConfirmClear(true)}><Icon name="trash"/><span><strong>清空全部记录</strong><small>同时清除本机与当前账户的数据</small></span></button>}
          </aside>
        </div>
      )}

      {recoveryStart && active && (
        <div className="recovery-layer" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
          <button className="recovery-close" onClick={finishRecovery} aria-label="结束恢复"><Icon name="close"/></button>
          <div className="breath-stage">
            <div className="breath-orbit"><span/></div>
            <p>九十秒恢复</p>
            <h2 id="recovery-title">{breathCopy}</h2>
            <span className="recovery-clock">{formatDuration(recoveryElapsed)} / 01:30</span>
            <small>不需要盯着屏幕。准备好时，回来继续：{active.intention}</small>
            <button onClick={finishRecovery}>我已经缓过来</button>
          </div>
        </div>
      )}
    </div>
  );
}
