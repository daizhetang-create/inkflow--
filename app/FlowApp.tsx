"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createSession,
  eventRecord,
  returnSeconds,
  transition,
  type FlowEvent,
  type FlowMode,
  type FlowSession,
  type ReviewOutcome,
} from "./flow/machine.mjs";
import {
  appendEvent,
  archiveSession,
  clearVnextData,
  loadHistory,
  loadProfile,
  loadSnapshot,
  saveProfile,
  saveSnapshot,
  type FlowProfile,
} from "./flow/storage";

type Panel = "history" | "settings" | null;

const MODES: { id: FlowMode; label: string; short: string }[] = [
  { id: "ai", label: "AI 任务", short: "AI" },
  { id: "work", label: "工作", short: "WORK" },
  { id: "read", label: "阅读", short: "READ" },
  { id: "meditate", label: "冥想", short: "REST" },
];

const MICRO_ACTIONS = [
  { id: "blank", label: "只留白", note: "把这段空档还给大脑，不塞进第二个任务。" },
  { id: "look", label: "看远处", note: "看向六米外，让眼睛和近距离思考一起松开。" },
  { id: "stretch", label: "起身伸展", note: "肩膀向后，慢慢站起，再决定是否离开。" },
  { id: "prompt", label: "写一句判断", note: "只写一个判断，不打开新的资料或页面。" },
];

const MODE_COPY: Record<FlowMode, { objective: string; objectivePlaceholder: string; next: string; nextPlaceholder: string }> = {
  ai: { objective: "正在等待什么", objectivePlaceholder: "例：让 AI 重构认证状态机", next: "回来第一步", nextPlaceholder: "例：先跑 reducer 的失败路径测试" },
  work: { objective: "当前工作", objectivePlaceholder: "例：整理发布前的回归问题", next: "回来第一步", nextPlaceholder: "例：只检查支付失败路径" },
  read: { objective: "正在读什么", objectivePlaceholder: "例：任务中断与恢复研究", next: "回来第一步", nextPlaceholder: "例：继续找 resumption lag 的定义" },
  meditate: { objective: "刚才在练习什么", objectivePlaceholder: "例：十分钟呼吸练习", next: "回来第一步", nextPlaceholder: "例：坐回去，先完整呼出一口气" },
};

function Icon({ name }: { name: "mark" | "history" | "settings" | "arrow" | "close" | "bolt" | "reset" }) {
  const paths: Record<string, React.ReactNode> = {
    mark: <><path d="M4 12h6"/><path d="M14 12h6"/><circle cx="12" cy="12" r="2.2"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    arrow: <><path d="M5 12h13"/><path d="m14 7 5 5-5 5"/></>,
    close: <><path d="m6 6 12 12"/><path d="M18 6 6 18"/></>,
    bolt: <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z"/>,
    reset: <><path d="M4 4v6h6"/><path d="M5.6 15A7 7 0 1 0 6 8"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24">{paths[name]}</svg>;
}

function FlowLine({ stage }: { stage: FlowSession["stage"] }) {
  const broken = stage === "waiting" || stage === "drift";
  const rejoining = stage === "return";
  return (
    <div className={`flow-line ${broken ? "is-broken" : ""} ${rejoining ? "is-rejoining" : ""}`} aria-hidden="true">
      <span className="line-left"/><span className="line-core"><i/></span><span className="line-right"/>
    </div>
  );
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function reviewLabel(value: ReviewOutcome | null) {
  return ({ complete: "完整接回", partial: "部分接回", lost: "仍有点丢失", skipped: "跳过复盘" } as Record<string, string>)[value ?? ""] ?? "未记录";
}

export function FlowApp() {
  const [session, setSession] = useState<FlowSession>(() => createSession());
  const [profile, setProfile] = useState<FlowProfile>(() => loadProfile());
  const [hydrated, setHydrated] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [objective, setObjective] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [source, setSource] = useState<"manual" | "simulation">("manual");
  const [durationMs, setDurationMs] = useState(20000);
  const [microAction, setMicroAction] = useState("blank");
  const [lowEnergy, setLowEnergy] = useState(false);
  const [rescueSame, setRescueSame] = useState(true);
  const [rescueAction, setRescueAction] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const sessionRef = useRef(session);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    const stored = loadSnapshot();
    const loadedProfile = loadProfile();
    if (stored) {
      setSession(stored);
      setObjective(stored.objective);
      setNextAction(stored.nextAction);
      setSource(stored.source);
      setMicroAction(stored.microAction);
      setLowEnergy(stored.lowEnergy);
    }
    setProfile(loadedProfile);
    setHydrated(true);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("inkflow-vnext");
    channelRef.current = channel;
    channel.onmessage = (message) => {
      const incoming = message.data?.session as FlowSession | undefined;
      if (incoming && incoming.revision > sessionRef.current.revision) {
        setSession(incoming);
        setObjective(incoming.objective);
        setNextAction(incoming.nextAction);
        setNotice("另一标签页刚刚推进了这条流，已同步到最新状态。");
      }
    };
    return () => channel.close();
  }, [hydrated]);

  useEffect(() => {
    if (session.stage !== "waiting") return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [session.stage]);

  const send = useCallback((event: FlowEvent) => {
    setNotice("");
    setSession((current) => {
      try {
        const at = Date.now();
        const after = transition(current, event, at);
        if (after === current) return current;
        saveSnapshot(after);
        appendEvent(eventRecord(current, after, event, at));
        channelRef.current?.postMessage({ session: after });
        if (event.type === "RECORD_REVIEW") archiveSession(after);
        return after;
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "这一步还缺少必要信息。");
        return current;
      }
    });
  }, []);

  useEffect(() => {
    if (session.stage !== "waiting" || session.source !== "simulation" || !session.expectedAt) return;
    const remaining = Math.max(0, session.expectedAt - Date.now());
    const timer = window.setTimeout(() => {
      send({ type: "SIGNAL_DONE", signalSource: "simulation" });
      if (profile.notifications && Notification.permission === "granted") {
        new Notification("墨流：任务已完成", { body: `回来先做：${session.nextAction}` });
      }
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [session.stage, session.source, session.expectedAt, session.nextAction, profile.notifications, send]);

  const modeCopy = MODE_COPY[session.mode];
  const advice = useMemo(() => {
    if (session.stage === "waiting") return MICRO_ACTIONS.find((item) => item.id === session.microAction)?.note ?? MICRO_ACTIONS[0].note;
    if (session.stage === "drift") return "不要重做计划。把动作缩小到两分钟内可以开始的程度。";
    if (session.stage === "return") return session.lowEnergy ? "低能量模式：只读一遍这句话，然后点击接回。" : "不要先查看别处。点击后，只执行封存的这一小步。";
    if (session.stage === "active") return "先完成这一小步，再决定是否扩展；墨流不会替你增加任务。";
    if (session.stage === "review") return "回想的不是效率，而是：你回来后是否知道第一步是什么？";
    return session.mode === "ai" ? "当 AI 开始等待时再封存。写动作，不要复制 Prompt 或代码。" : "只写一个回来时能立即执行的动作。";
  }, [session.stage, session.microAction, session.lowEnergy, session.mode]);

  const startWait = () => send({
    type: "START_WAIT", objective, nextAction, mode: session.mode, source, durationMs, microAction, lowEnergy,
  });

  const newSession = () => {
    send({ type: "NEW_SESSION", mode: session.mode, source });
    setObjective("");
    setNextAction("");
    setRescueAction("");
  };

  const updateProfile = (patch: Partial<FlowProfile>) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    saveProfile(next);
  };

  const askNotifications = async () => {
    if (!("Notification" in window)) return setNotice("当前浏览器不支持系统通知；应用仍可完整使用。");
    const permission = await Notification.requestPermission();
    updateProfile({ notifications: permission === "granted" });
    setNotice(permission === "granted" ? "通知已开启。只在模拟任务完成时提醒。" : "没有开启通知；应用不会再次主动询问。");
  };

  const chooseMode = (mode: FlowMode) => {
    if (session.stage !== "idle") return;
    setSession((current) => ({ ...current, mode }));
    updateProfile({ preferredMode: mode });
  };

  const elapsed = session.checkpointAt ? now - session.checkpointAt : 0;

  return (
    <div className={`flow-app stage-${session.stage} ${lowEnergy ? "low-energy" : ""}`}>
      <a className="skip-link" href="#flow-main">跳到主要操作</a>
      <aside className="app-rail" aria-label="墨流导航">
        <button className="wordmark" aria-label="墨流首页" onClick={newSession}><Icon name="mark"/><span>墨流</span></button>
        <div className="rail-track" aria-hidden="true"><i className="rail-progress"/></div>
        <nav>
          <button className={panel === "history" ? "active" : ""} onClick={() => setPanel(panel === "history" ? null : "history")} aria-label="接回记录"><Icon name="history"/><span>记录</span></button>
          <button className={panel === "settings" ? "active" : ""} onClick={() => setPanel(panel === "settings" ? null : "settings")} aria-label="设置"><Icon name="settings"/><span>设置</span></button>
        </nav>
        <span className="version">VN / 01</span>
      </aside>

      <main id="flow-main" className="flow-main">
        <header className="topbar">
          <div className="topbar-state"><span className="signal-dot"/> ATTENTION CONTINUITY / {session.stage.toUpperCase()}</div>
          <div className="topbar-meta"><span>{profile.completedReturns} 次接回</span><span>LOCAL FIRST</span></div>
        </header>

        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="关闭提示"><Icon name="close"/></button></div>}
        <FlowLine stage={session.stage}/>

        <section className="scene" aria-live="polite">
          {session.stage === "idle" && (
            <div className="setup-grid">
              <div className="scene-copy">
                <p className="eyebrow">RETURN GATE / 01</p>
                <h1>先写下回来后<br/><em>要做的第一步。</em></h1>
                <p className="lede">等待不是休息的问题。真正昂贵的是回来时，要重新拼起刚才的自己。</p>
                <div className="mode-switch" aria-label="选择场景">
                  {MODES.map((item) => <button key={item.id} aria-pressed={session.mode === item.id} onClick={() => chooseMode(item.id)}><b>{item.short}</b>{item.label}</button>)}
                </div>
              </div>
              <div className="capture-form">
                <label><span>{modeCopy.objective}</span><input value={objective} onChange={(event) => setObjective(event.target.value)} placeholder={modeCopy.objectivePlaceholder} maxLength={120}/></label>
                <label><span>{modeCopy.next}</span><textarea value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder={modeCopy.nextPlaceholder} maxLength={180} rows={3}/><small>{nextAction.length}/180 · 不要粘贴 Prompt、代码或隐私</small></label>
                <div className="source-row">
                  <span>完成信号来源</span>
                  <div className="compact-toggle"><button aria-pressed={source === "manual"} onClick={() => setSource("manual")}>手动</button><button aria-pressed={source === "simulation"} onClick={() => setSource("simulation")}>模拟</button></div>
                </div>
                {source === "simulation" && <div className="duration-row"><span>明确模拟，不代表真实集成</span><button className={durationMs === 20000 ? "selected" : ""} onClick={() => setDurationMs(20000)}>20 秒演示</button><button className={durationMs === 300000 ? "selected" : ""} onClick={() => setDurationMs(300000)}>5 分钟</button></div>}
                <button className="primary-action" disabled={!objective.trim() || !nextAction.trim()} onClick={startWait}>封存并进入空档 <Icon name="arrow"/></button>
              </div>
            </div>
          )}

          {session.stage === "waiting" && (
            <div className="waiting-scene">
              <p className="eyebrow">CHECKPOINT SAVED / {session.source === "simulation" ? "SIMULATION" : "MANUAL"}</p>
              <h1>任务在别处运行。<br/><em>注意力不用站岗。</em></h1>
              <div className="void-meter"><span>空档已开始</span><b>{formatClock(elapsed)}</b><small>正计时只用于恢复记录，不设效率目标</small></div>
              <div className="checkpoint-strip"><span>回来只做</span><strong>{session.nextAction}</strong></div>
              <div className="micro-grid" aria-label="选择脑间歇">
                {MICRO_ACTIONS.map((item, index) => <button key={item.id} aria-pressed={microAction === item.id} onClick={() => { setMicroAction(item.id); setSession((current) => ({ ...current, microAction: item.id })); }}><i>0{index + 1}</i>{item.label}</button>)}
              </div>
              <div className="action-row">
                <button className="primary-action" onClick={() => send({ type: "SIGNAL_DONE", signalSource: "manual" })}>任务已完成 <Icon name="arrow"/></button>
                <button className="text-action" onClick={() => send({ type: "EARLY_RETURN" })}>提前回来</button>
              </div>
              {session.source === "simulation" && <p className="source-proof"><Icon name="bolt"/> 模拟信号将在页面刷新后继续；你也可以手动标记完成。</p>}
            </div>
          )}

          {session.stage === "return" && (
            <div className="return-scene">
              <p className="eyebrow">RETURN SIGNAL / {session.lastSignal?.toUpperCase()}</p>
              <h1>{session.lastSignal === "self-rescue" ? "路还在。" : "它完成了。"}<br/><em>你不用重新找路。</em></h1>
              <button className="return-gate" onClick={() => send({ type: "REJOIN" })}>
                <span>回来第一步</span><strong>{session.nextAction}</strong><b>接回这一步 <Icon name="arrow"/></b>
              </button>
              <p className="privacy-note">墨流只保存这句由你写下的动作；不会读取当前网页、代码或 Prompt。</p>
            </div>
          )}

          {session.stage === "active" && (
            <div className="active-scene">
              <p className="eyebrow">THREAD REJOINED / {returnSeconds(session) ?? 0}S</p>
              <h1>现在只做<br/><em>这一小步。</em></h1>
              <div className="active-task"><span>{session.objective}</span><strong>{session.nextAction}</strong><i>连接已恢复</i></div>
              <div className="action-row">
                <button className="primary-action" onClick={() => send({ type: "COMPLETE_STEP" })}>这一步完成了 <Icon name="arrow"/></button>
                <button className="text-action" onClick={() => { setObjective(session.objective); setNextAction(""); send({ type: "NEW_SESSION", mode: session.mode, source: session.source }); }}>再开一个空档</button>
              </div>
            </div>
          )}

          {session.stage === "drift" && (
            <div className="drift-scene">
              <p className="eyebrow">DRIFT RESCUE / NO SURVEILLANCE</p>
              <h1>不用责备自己。<br/><em>把下一步缩小。</em></h1>
              <div className="rescue-card">
                <span>原来的目的还一样吗？</span>
                <div className="binary-choice"><button aria-pressed={rescueSame} onClick={() => setRescueSame(true)}>一样，帮我重算</button><button aria-pressed={!rescueSame} onClick={() => setRescueSame(false)}>变了，我重新写</button></div>
                {!rescueSame && <label><span>新的目的</span><input value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="只写现在真正要推进的事"/></label>}
                <label><span>两分钟内能开始的第一步</span><textarea value={rescueAction} onChange={(event) => setRescueAction(event.target.value)} placeholder="例：只检查 reducer 的非法转换" rows={3}/></label>
                <button className="primary-action" disabled={!rescueAction.trim()} onClick={() => send({ type: "RESCUE", objective: rescueSame ? session.objective : objective, nextAction: rescueAction })}>接回 <Icon name="arrow"/></button>
              </div>
            </div>
          )}

          {session.stage === "review" && (
            <div className="review-scene">
              <p className="eyebrow">RETURN REVIEW / ONE TAP</p>
              <h1>回来时，<br/><em>路还清楚吗？</em></h1>
              {!session.review ? (
                <div className="review-grid">
                  {(["complete", "partial", "lost", "skipped"] as ReviewOutcome[]).map((outcome, index) => <button key={outcome} onClick={() => { send({ type: "RECORD_REVIEW", outcome }); if (outcome !== "skipped") updateProfile({ completedReturns: profile.completedReturns + 1 }); }}><i>0{index + 1}</i>{reviewLabel(outcome)}</button>)}
                </div>
              ) : (
                <div className="review-result">
                  <div><span>接回时延</span><strong>{returnSeconds(session) ?? 0}<small> 秒</small></strong></div>
                  <div><span>恢复质量</span><strong className="quality">{reviewLabel(session.review)}</strong></div>
                  <div><span>本次漂移救援</span><strong>{session.driftCount}<small> 次</small></strong></div>
                  <button className="primary-action" onClick={newSession}>开始下一条流 <Icon name="reset"/></button>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="context-dock" aria-label="当前建议">
          <div><span>NOW / SMART NUDGE</span><p>{advice}</p></div>
          {session.stage !== "drift" && session.stage !== "review" && <button className="drift-trigger" onClick={() => { setRescueAction(session.nextAction ? `只做：${session.nextAction}` : ""); send({ type: "REPORT_DRIFT", objective: objective || session.objective, nextAction: nextAction || session.nextAction }); }}>我飘走了</button>}
        </aside>
      </main>

      {panel && <div className="panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(null); }}>
        <aside className="side-panel" role="dialog" aria-modal="true" aria-label={panel === "history" ? "接回记录" : "设置"}>
          <header><div><span>INKFLOW / LOCAL</span><h2>{panel === "history" ? "接回记录" : "设置"}</h2></div><button onClick={() => setPanel(null)} aria-label="关闭"><Icon name="close"/></button></header>
          {panel === "history" ? <HistoryPanel current={session}/> : <SettingsPanel profile={profile} lowEnergy={lowEnergy} setLowEnergy={setLowEnergy} askNotifications={askNotifications} clearData={() => { if (window.confirm("只清除墨流 vNext 的本地记录？旧版数据不会被触碰。")) { clearVnextData(); window.location.reload(); } }}/>}
        </aside>
      </div>}

      {hydrated && !profile.onboarded && <div className="welcome-backdrop">
        <section className="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
          <p className="eyebrow">INKFLOW VNEXT / FIRST RETURN</p>
          <h2 id="welcome-title">不是盯住时间。<br/><em>是保住那条思路。</em></h2>
          <p>墨流会在 AI 等待、工作中断或阅读间隙前，替你封存一句“回来第一步”。数据只留在这台设备。</p>
          <div className="welcome-proof"><span>01</span>不读取网页与代码<i/><span>02</span>不请求登录<i/><span>03</span>不按分钟评价你</div>
          <button className="primary-action" onClick={() => updateProfile({ onboarded: true })}>开始第一条流 <Icon name="arrow"/></button>
        </section>
      </div>}
    </div>
  );
}

function HistoryPanel({ current }: { current: FlowSession }) {
  const history = loadHistory();
  const items = current.review ? [current, ...history.filter((item) => item.id !== current.id)] : history;
  if (!items.length) return <div className="empty-panel"><Icon name="history"/><p>还没有完成的接回记录。</p><span>第一条记录会在你完成 Review 后出现。</span></div>;
  return <div className="history-list">{items.map((item, index) => <article key={item.id}><i>{String(index + 1).padStart(2, "0")}</i><div><span>{MODES.find((mode) => mode.id === item.mode)?.label} · {new Date(item.updatedAt).toLocaleDateString("zh-CN")}</span><strong>{item.nextAction}</strong><small>{returnSeconds(item) ?? "—"} 秒接回 · {reviewLabel(item.review)}</small></div></article>)}</div>;
}

function SettingsPanel({ profile, lowEnergy, setLowEnergy, askNotifications, clearData }: { profile: FlowProfile; lowEnergy: boolean; setLowEnergy: (value: boolean) => void; askNotifications: () => void; clearData: () => void }) {
  return <div className="settings-list">
    <section><div><strong>低能量模式</strong><p>减少次级信息与动态，让接回动作更轻。</p></div><button className="switch" aria-pressed={lowEnergy} onClick={() => setLowEnergy(!lowEnergy)}><i/></button></section>
    <section><div><strong>完成通知</strong><p>只用于明确的模拟任务。首次点击后才向浏览器申请。</p></div><button className="outline-button" onClick={askNotifications}>{profile.notifications ? "已开启" : "选择开启"}</button></section>
    <section><div><strong>存储方式</strong><p>所有快照、事件与节律记忆只保存在当前浏览器。</p></div><span className="local-badge">LOCAL</span></section>
    <section className="danger-zone"><div><strong>清除 vNext 数据</strong><p>旧版计时器数据不受影响。</p></div><button className="outline-button" onClick={clearData}>清除</button></section>
  </div>;
}
