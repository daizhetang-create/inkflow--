"use client";

import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Viewer } from "../attention/types";
import {
  fetchRemotePlans,
  flushPlanQueue,
  loadPlanCache,
  mergePlans,
  postPlanAction,
  queuePlanAction,
  removeQueuedPlanAction,
  savePlanCache,
} from "./store";
import type { PlanAction, PlanItem } from "./types";

type PlanSyncState = "loading" | "synced" | "local" | "syncing";

const DURATIONS = [25, 45, 60, 90];

function makePlanId() {
  return `p_${crypto.randomUUID().replaceAll("-", "")}`;
}

function sameDay(iso: string, date = new Date()) {
  const value = new Date(iso);
  return value.getFullYear() === date.getFullYear() && value.getMonth() === date.getMonth() && value.getDate() === date.getDate();
}

function clockLabel(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(date);
}

function inputTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function elapsedSeconds(item: PlanItem, now: number) {
  if (item.status !== "active" || !item.startedAt) return item.elapsedSeconds;
  return item.elapsedSeconds + Math.max(0, Math.floor((now - new Date(item.startedAt).getTime()) / 1000));
}

function timerLabel(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function endTime(item: PlanItem) {
  return new Date(new Date(item.plannedStart).getTime() + item.durationMinutes * 60000).toISOString();
}

function statusLabel(item: PlanItem) {
  if (item.status === "active") return "计时中";
  if (item.status === "paused") return "已暂停";
  if (item.status === "completed") return "已完成";
  return "待开始";
}

export function PlannerView({ viewer }: { viewer: Viewer }) {
  const [items, setItems] = useState<PlanItem[]>(() => loadPlanCache());
  const [now, setNow] = useState(() => Date.now());
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTime, setDraftTime] = useState(() => inputTime(new Date()));
  const [draftDuration, setDraftDuration] = useState(45);
  const [notice, setNotice] = useState("");
  const [syncState, setSyncState] = useState<PlanSyncState>("loading");
  const syncChain = useRef<Promise<void>>(Promise.resolve());
  const expiredPlan = useRef("");

  const todayItems = useMemo(
    () => items.filter((item) => sameDay(item.plannedStart)).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart)),
    [items],
  );
  const activeItem = todayItems.find((item) => item.status === "active") ?? null;
  const pausedItem = todayItems.find((item) => item.status === "paused") ?? null;
  const plannedItems = todayItems.filter((item) => item.status === "planned");
  const nextItem = plannedItems.find((item) => new Date(item.plannedStart).getTime() >= now) ?? plannedItems[0] ?? null;
  const focusItem = activeItem ?? pausedItem ?? nextItem;
  const completedCount = todayItems.filter((item) => item.status === "completed").length;
  const plannedMinutes = todayItems.reduce((total, item) => total + item.durationMinutes, 0);
  const currentElapsed = focusItem ? elapsedSeconds(focusItem, now) : 0;
  const currentRemaining = focusItem ? focusItem.durationMinutes * 60 - currentElapsed : 0;
  const currentProgress = focusItem ? Math.min(1, currentElapsed / (focusItem.durationMinutes * 60)) : 0;

  const syncPlans = useCallback((showNotice = false) => {
    if (!navigator.onLine) {
      setSyncState("local");
      if (showNotice) setNotice("离线也可以继续安排，计划已留在本机。");
      return;
    }
    setSyncState("syncing");
    syncChain.current = syncChain.current.then(async () => {
      try {
        await flushPlanQueue();
        const remote = await fetchRemotePlans();
        setItems((current) => mergePlans(current, remote));
        setSyncState("synced");
      } catch {
        setSyncState("local");
      }
    });
  }, []);

  const enqueue = useCallback((action: PlanAction) => {
    queuePlanAction(action);
    setSyncState("syncing");
    syncChain.current = syncChain.current.then(async () => {
      try {
        await postPlanAction(action);
        removeQueuedPlanAction(action.key);
        setSyncState("synced");
      } catch {
        setSyncState("local");
      }
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => syncPlans(false), 0);
    return () => window.clearTimeout(timer);
  }, [syncPlans]);

  useEffect(() => savePlanCache(items), [items]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!activeItem || currentRemaining > 0 || expiredPlan.current === activeItem.id) return;
    expiredPlan.current = activeItem.id;
    setNotice(`“${activeItem.title}”的计划时间到了。可以完成，也可以继续。`);
    navigator.vibrate?.([120, 80, 120]);
  }, [activeItem, currentRemaining]);

  useEffect(() => {
    const online = () => syncPlans(true);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [syncPlans]);

  const persist = useCallback((item: PlanItem) => {
    enqueue({ key: `plan:${item.id}:${item.updatedAt}`, action: "upsert", item });
  }, [enqueue]);

  const openComposer = () => {
    const rounded = new Date(Math.ceil(Date.now() / 300000) * 300000);
    let candidate = rounded;
    for (const item of todayItems.filter((value) => value.status !== "completed")) {
      const start = new Date(item.plannedStart);
      const end = new Date(start.getTime() + item.durationMinutes * 60000);
      if (start <= candidate && end > candidate) candidate = end;
    }
    setDraftTime(inputTime(candidate));
    setDraftTitle("");
    setDraftDuration(45);
    setComposerOpen(true);
  };

  const addPlan = (event: FormEvent) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) {
      setNotice("先写下这一段准备做什么。");
      return;
    }
    const [hour, minute] = draftTime.split(":").map(Number);
    const planned = new Date();
    planned.setHours(hour, minute, 0, 0);
    const updatedAt = new Date().toISOString();
    const item: PlanItem = {
      id: makePlanId(),
      title,
      plannedStart: planned.toISOString(),
      durationMinutes: Math.max(5, Math.min(480, Math.round(draftDuration))),
      status: "planned",
      startedAt: null,
      elapsedSeconds: 0,
      completedAt: null,
      updatedAt,
    };
    setItems((current) => [...current, item].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart)));
    persist(item);
    setComposerOpen(false);
    setNotice(`已安排在 ${clockLabel(item.plannedStart)}。`);
  };

  const startPlan = (target: PlanItem) => {
    const timestamp = new Date().toISOString();
    const changed: PlanItem[] = [];
    const next = items.map((item) => {
      if (item.id === target.id) {
        const value = { ...item, status: "active" as const, startedAt: timestamp, completedAt: null, updatedAt: timestamp };
        changed.push(value);
        return value;
      }
      if (item.status === "active" && item.startedAt) {
        const value = {
          ...item,
          status: "paused" as const,
          elapsedSeconds: elapsedSeconds(item, Date.now()),
          startedAt: null,
          updatedAt: timestamp,
        };
        changed.push(value);
        return value;
      }
      return item;
    });
    setItems(next);
    changed.forEach(persist);
    expiredPlan.current = "";
    setNotice(`现在开始：${target.title}`);
  };

  const pausePlan = (target: PlanItem) => {
    const updatedAt = new Date().toISOString();
    const next: PlanItem = {
      ...target,
      status: "paused",
      elapsedSeconds: elapsedSeconds(target, Date.now()),
      startedAt: null,
      updatedAt,
    };
    setItems((current) => current.map((item) => item.id === target.id ? next : item));
    persist(next);
    setNotice("计时已暂停，已经走过的时间会保留。");
  };

  const completePlan = (target: PlanItem) => {
    const completedAt = new Date().toISOString();
    const next: PlanItem = {
      ...target,
      status: "completed",
      elapsedSeconds: elapsedSeconds(target, Date.now()),
      startedAt: null,
      completedAt,
      updatedAt: completedAt,
    };
    setItems((current) => current.map((item) => item.id === target.id ? next : item));
    persist(next);
    setNotice(`“${target.title}”已经完成。`);
  };

  const extendPlan = (target: PlanItem) => {
    const updatedAt = new Date().toISOString();
    const next = { ...target, durationMinutes: Math.min(480, target.durationMinutes + 10), updatedAt };
    setItems((current) => current.map((item) => item.id === target.id ? next : item));
    persist(next);
    expiredPlan.current = "";
    setNotice("已经加上 10 分钟。");
  };

  const deletePlan = (target: PlanItem) => {
    if (target.status === "active") return;
    setItems((current) => current.filter((item) => item.id !== target.id));
    enqueue({ key: `delete-plan:${target.id}`, action: "delete", id: target.id });
    setNotice("这段计划已经移除。");
  };

  const focusState = focusItem?.status === "active"
    ? currentRemaining > 0 ? "正在计时" : "计划时间已到"
    : focusItem?.status === "paused" ? "暂停在这里" : "下一段";
  const syncLabel = syncState === "synced" ? "云端已同步" : syncState === "syncing" || syncState === "loading" ? "正在同步" : viewer ? "暂存本机" : "本机计划";

  return (
    <section className="planner-screen screen-enter">
      {notice && <div className="plan-notice" role="status">{notice}</div>}

      <header className="planner-heading">
        <div className="planner-title-block">
          <span className="eyebrow">{dateLabel(new Date())} · TODAY</span>
          <div className="planner-title-line">
            <h1>今天</h1>
            <span className="planner-day-status">{todayItems.length ? `${completedCount} / ${todayItems.length} 已收好` : "一整天还在等你"}</span>
          </div>
          <p>只看下一段。其他时间，沿着墨线排开。</p>
        </div>
        <button className="plan-add-button" onClick={openComposer} aria-label="新建一段计划"><span>＋</span><b>新建</b></button>
      </header>

      <div className="planner-grid">
        <article aria-live="polite" className={`current-plan-card ${focusItem?.status === "active" ? "is-running" : ""} ${focusItem?.status === "paused" ? "is-paused" : ""} ${currentRemaining <= 0 && activeItem ? "is-overtime" : ""}`}>
          <div className="current-plan-topline">
            <div className="current-plan-meta">
              <span><i/>{focusState}</span>
              <button onClick={() => syncPlans(true)}>{syncLabel}</button>
            </div>
            <span className="current-plan-index" aria-hidden="true">NOW</span>
          </div>

          {focusItem ? (
            <>
              <div className="current-plan-copy">
                <div className="plan-window"><span>{clockLabel(focusItem.plannedStart)}</span><i/><span>{clockLabel(endTime(focusItem))}</span><small>{focusItem.durationMinutes} 分钟</small></div>
                <h2>{focusItem.title}</h2>
              </div>

              {focusItem.status === "active" || focusItem.status === "paused" ? (
                <div className="plan-timer-stage">
                  <div className="plan-timer-ring" style={{ "--plan-progress": `${currentProgress * 360}deg` } as CSSProperties}>
                    <div>
                      <small>{currentRemaining >= 0 ? "剩余" : "超时"}</small>
                      <strong>{currentRemaining < 0 ? "+" : ""}{timerLabel(Math.abs(currentRemaining))}</strong>
                    </div>
                  </div>
                  <div className="timer-actions">
                    {focusItem.status === "active"
                      ? <button className="timer-secondary" onClick={() => pausePlan(focusItem)}>暂停</button>
                      : <button className="timer-primary" onClick={() => startPlan(focusItem)}>继续</button>}
                    {currentRemaining <= 0 && <button className="timer-secondary" onClick={() => extendPlan(focusItem)}>＋10 分钟</button>}
                    <button className="timer-complete" onClick={() => completePlan(focusItem)}>完成</button>
                  </div>
                </div>
              ) : (
                <div className="plan-ready-stage">
                  <div><span>{new Date(focusItem.plannedStart).getTime() <= now ? "原定时间已到" : `还有 ${Math.max(1, Math.ceil((new Date(focusItem.plannedStart).getTime() - now) / 60000))} 分钟`}</span><p>准备好时再开始，计划不会替你做决定。</p></div>
                  <button onClick={() => startPlan(focusItem)}><span>开始这件事</span><i>→</i></button>
                </div>
              )}
            </>
          ) : (
            <div className="plan-empty-focus">
              <span>{todayItems.length ? "今天已经全部收好" : "今天还没有安排"}</span>
              <h2>{todayItems.length ? "今天，已经完整了。" : "先给今天一个起点。"}</h2>
              <p>{todayItems.length ? "剩下的时间不需要被填满。" : "不需要排满，只安排下一件真正要做的事。"}</p>
              <button onClick={openComposer}>安排第一段 <i>→</i></button>
            </div>
          )}
        </article>

        <aside className="day-agenda" aria-label="今天的时间安排">
          <header className="agenda-heading">
            <div><span>时间流</span><strong>{todayItems.length ? `${todayItems.length} 段` : "尚未安排"}</strong></div>
            <p>{todayItems.length ? `${plannedMinutes} 分钟计划 · ${completedCount} 段完成` : "从下一段开始，不用排满今天。"}</p>
          </header>

          <div className="agenda-list">
            {todayItems.length === 0 ? (
              <button className="agenda-empty" onClick={openComposer}><i>＋</i><span><strong>从一段时间开始</strong><small>任务、开始时间、时长</small></span></button>
            ) : todayItems.map((item) => (
              <article key={item.id} className={`agenda-item is-${item.status} ${focusItem?.id === item.id ? "is-focus" : ""}`}>
                <div className="agenda-time"><strong>{clockLabel(item.plannedStart)}</strong><span>{clockLabel(endTime(item))}</span></div>
                <div className="agenda-spine"><i/></div>
                <div className="agenda-content">
                  <div><span>{statusLabel(item)}</span><h3>{item.title}</h3><small>{item.durationMinutes} 分钟{item.elapsedSeconds > 0 ? ` · 已进行 ${Math.max(1, Math.round(elapsedSeconds(item, now) / 60))} 分钟` : ""}</small></div>
                  <div className="agenda-actions">
                    {item.status === "planned" && <button onClick={() => startPlan(item)}>开始</button>}
                    {item.status === "paused" && <button onClick={() => startPlan(item)}>继续</button>}
                    {item.status !== "active" && <button className="agenda-delete" onClick={() => deletePlan(item)} aria-label={`移除计划：${item.title}`}>×</button>}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {todayItems.length > 0 && <button className="agenda-add" onClick={openComposer}><span>＋</span>接着安排</button>}
        </aside>
      </div>

      {composerOpen && (
        <div className="plan-composer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposerOpen(false); }}>
          <aside className="plan-composer" role="dialog" aria-modal="true" aria-labelledby="plan-composer-title">
            <header><div><span>放进今日时间流</span><h2 id="plan-composer-title">安排一段</h2></div><button onClick={() => setComposerOpen(false)} aria-label="关闭安排窗口">×</button></header>
            <form onSubmit={addPlan}>
              <label className="plan-title-field"><span>这段时间做什么？</span><input autoFocus value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={120} placeholder="例如：读完这一章"/></label>
              <div className="plan-field-row">
                <label><span>开始时间</span><input type="time" value={draftTime} onChange={(event) => setDraftTime(event.target.value)} required/></label>
                <label><span>分钟</span><input type="number" min="5" max="480" step="5" value={draftDuration} onChange={(event) => setDraftDuration(Number(event.target.value))} required/></label>
              </div>
              <div className="duration-choices" aria-label="常用时长">
                {DURATIONS.map((duration) => <button type="button" key={duration} aria-pressed={draftDuration === duration} onClick={() => setDraftDuration(duration)}>{duration}<small>分钟</small></button>)}
              </div>
              <button className="plan-save-button" type="submit"><span>放进今天</span><i>→</i></button>
              <p>保存后可以直接开始；计划时间到了也不会强行中断。</p>
            </form>
          </aside>
        </div>
      )}
    </section>
  );
}
