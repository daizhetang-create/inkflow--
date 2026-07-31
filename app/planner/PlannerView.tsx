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
type StartMode = "now" | "later";

const DURATIONS = [25, 45, 60, 90];

function makePlanId() {
  return `p_${crypto.randomUUID().replaceAll("-", "")}`;
}

function sameDay(iso: string, date = new Date()) {
  const value = new Date(iso);
  return value.getFullYear() === date.getFullYear()
    && value.getMonth() === date.getMonth()
    && value.getDate() === date.getDate();
}

function clockLabel(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
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
  if (item.status === "active") return "正在进行";
  if (item.status === "paused") return "已暂停";
  if (item.status === "completed") return "已完成";
  return "等待开始";
}

export function PlannerView({ viewer }: { viewer: Viewer }) {
  const [items, setItems] = useState<PlanItem[]>(() => loadPlanCache());
  const [now, setNow] = useState(() => Date.now());
  const [startMode, setStartMode] = useState<StartMode>("now");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTime, setDraftTime] = useState(() => inputTime(new Date()));
  const [draftDuration, setDraftDuration] = useState(45);
  const [notice, setNotice] = useState("");
  const [syncState, setSyncState] = useState<PlanSyncState>("loading");
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [queueDraftOpen, setQueueDraftOpen] = useState(false);
  const syncChain = useRef<Promise<void>>(Promise.resolve());
  const expiredPlan = useRef("");
  const titleInput = useRef<HTMLInputElement>(null);

  const todayItems = useMemo(
    () => items
      .filter((item) => sameDay(item.plannedStart))
      .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart)),
    [items],
  );
  const activeItem = todayItems.find((item) => item.status === "active") ?? null;
  const pausedItem = todayItems.find((item) => item.status === "paused") ?? null;
  const openItems = todayItems.filter((item) => item.status === "planned" || item.status === "paused");
  const nextItem = openItems.find((item) => new Date(item.plannedStart).getTime() >= now) ?? openItems[0] ?? null;
  const completedCount = todayItems.filter((item) => item.status === "completed").length;
  const focusItem = activeItem ?? pausedItem;
  const currentElapsed = focusItem ? elapsedSeconds(focusItem, now) : 0;
  const currentRemaining = focusItem ? focusItem.durationMinutes * 60 - currentElapsed : 0;
  const currentProgress = focusItem
    ? Math.min(1, Math.max(0, currentElapsed / (focusItem.durationMinutes * 60)))
    : 0;

  const syncPlans = useCallback((showNotice = false) => {
    if (!navigator.onLine) {
      setSyncState("local");
      if (showNotice) setNotice("现在离线，计划仍然保存在这台设备上。");
      return;
    }
    setSyncState("syncing");
    syncChain.current = syncChain.current.then(async () => {
      try {
        await flushPlanQueue();
        const remote = await fetchRemotePlans();
        setItems((current) => mergePlans(current, remote));
        setSyncState("synced");
        if (showNotice) setNotice("今天已经同步。");
      } catch {
        setSyncState("local");
        if (showNotice) setNotice("暂时无法同步，本机记录没有丢失。");
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
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!activeItem || currentRemaining > 0 || expiredPlan.current === activeItem.id) return;
    expiredPlan.current = activeItem.id;
    setNotice("这一段的时间到了。你可以完成，也可以继续十分钟。");
    navigator.vibrate?.([100, 70, 100]);
  }, [activeItem, currentRemaining]);

  useEffect(() => {
    const online = () => syncPlans(true);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [syncPlans]);

  useEffect(() => {
    if (!mobileQueueOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileQueueOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileQueueOpen]);

  const persist = useCallback((item: PlanItem) => {
    enqueue({ key: `plan:${item.id}:${item.updatedAt}`, action: "upsert", item });
  }, [enqueue]);

  const startPlan = (target: PlanItem) => {
    const timestamp = new Date().toISOString();
    const changed: PlanItem[] = [];
    const next = items.map((item) => {
      if (item.id === target.id) {
        const value = {
          ...item,
          status: "active" as const,
          startedAt: timestamp,
          completedAt: null,
          updatedAt: timestamp,
        };
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
    setNotice(`开始：${target.title}`);
  };

  const createPlan = (event: FormEvent) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) {
      titleInput.current?.focus();
      setNotice("先写下这一段只做什么。");
      return;
    }
    const planned = new Date();
    if (startMode === "later") {
      const [hour, minute] = draftTime.split(":").map(Number);
      planned.setHours(hour, minute, 0, 0);
    }
    const updatedAt = new Date().toISOString();
    const beginsNow = startMode === "now";
    const item: PlanItem = {
      id: makePlanId(),
      title,
      plannedStart: planned.toISOString(),
      durationMinutes: Math.max(5, Math.min(480, Math.round(draftDuration))),
      status: beginsNow ? "active" : "planned",
      startedAt: beginsNow ? updatedAt : null,
      elapsedSeconds: 0,
      completedAt: null,
      updatedAt,
    };
    setItems((current) => [...current, item].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart)));
    persist(item);
    setDraftTitle("");
    if (beginsNow) {
      expiredPlan.current = "";
      setNotice(`开始：${item.title}`);
    }
    else {
      setNotice(`${clockLabel(item.plannedStart)} 已经留给“${item.title}”。`);
      setDraftTime(inputTime(new Date(new Date(item.plannedStart).getTime() + item.durationMinutes * 60000)));
      setQueueDraftOpen(false);
    }
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
    setNotice("暂停了。走过的时间已经保留。");
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
    setNotice(`“${target.title}”已经收好。`);
    window.setTimeout(() => titleInput.current?.focus(), 80);
  };

  const extendPlan = (target: PlanItem) => {
    const updatedAt = new Date().toISOString();
    const next = {
      ...target,
      durationMinutes: Math.min(480, target.durationMinutes + 10),
      updatedAt,
    };
    setItems((current) => current.map((item) => item.id === target.id ? next : item));
    persist(next);
    expiredPlan.current = "";
    setNotice("继续十分钟。");
  };

  const deletePlan = (target: PlanItem) => {
    if (target.status === "active") return;
    setItems((current) => current.filter((item) => item.id !== target.id));
    enqueue({ key: `delete-plan:${target.id}`, action: "delete", id: target.id });
    setNotice("这一段已经移出今天。");
  };

  const selectLater = () => {
    setStartMode("later");
    const rounded = new Date(Math.ceil(Date.now() / 300000) * 300000);
    const lastOpen = [...todayItems]
      .filter((item) => item.status !== "completed")
      .sort((a, b) => endTime(a).localeCompare(endTime(b)))
      .at(-1);
    const candidate = lastOpen && new Date(endTime(lastOpen)) > rounded
      ? new Date(endTime(lastOpen))
      : rounded;
    setDraftTime(inputTime(candidate));
    window.setTimeout(() => titleInput.current?.focus(), 30);
  };

  const openQueueDraft = () => {
    selectLater();
    if (!focusItem) {
      setMobileQueueOpen(false);
      return;
    }
    setQueueDraftOpen(true);
    setMobileQueueOpen(true);
  };

  const syncLabel = syncState === "synced"
    ? "已同步"
    : syncState === "syncing" || syncState === "loading"
      ? "同步中"
      : viewer
        ? "等待同步"
        : "保存在本机";

  return (
    <>
      {notice && <div className="zero-toast" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>}

      <header className="zero-topbar">
        <button className="zero-brand" onClick={() => titleInput.current?.focus()} aria-label="回到新建一段">
          <span aria-hidden="true">墨</span>
          <strong>墨流</strong>
        </button>
        <div className="zero-date"><span>{dateLabel(new Date())}</span><i/><b>{todayItems.length ? `${completedCount}/${todayItems.length} 完成` : "今天还很空"}</b></div>
        <button className={`zero-sync is-${syncState}`} onClick={() => syncPlans(true)}><i/>{syncLabel}</button>
      </header>

      <main id="inkflow-main" className={`zero-main ${focusItem ? "is-focus" : "is-compose"}`}>
        {focusItem ? (
          <section className="zero-focus" aria-live="polite">
            <div className="zero-focus-copy">
              <span className="zero-overline">{focusItem.status === "active" ? "正在进行" : "暂停在这里"} · {clockLabel(focusItem.plannedStart)}</span>
              <h1>{focusItem.title}</h1>
            </div>

            <div className="zero-time">
              <div className="zero-time-value">
                <small>{currentRemaining >= 0 ? "剩余" : "超时"}</small>
                <strong>{currentRemaining < 0 ? "+" : ""}{timerLabel(Math.abs(currentRemaining))}</strong>
              </div>
              <div className="zero-progress" aria-label={`已经进行 ${Math.round(currentProgress * 100)}%`}>
                <i style={{ "--progress": `${currentProgress * 100}%` } as CSSProperties}/>
              </div>
              <div className="zero-time-ends"><span>{clockLabel(focusItem.startedAt ?? focusItem.plannedStart)}</span><span>{focusItem.durationMinutes} 分钟</span></div>
            </div>

            <div className="zero-focus-actions">
              {focusItem.status === "active"
                ? <button className="zero-quiet-action" onClick={() => pausePlan(focusItem)}>暂停</button>
                : <button className="zero-primary-action" onClick={() => startPlan(focusItem)}>继续</button>}
              {currentRemaining <= 0 && <button className="zero-quiet-action" onClick={() => extendPlan(focusItem)}>再给 10 分钟</button>}
              <button className="zero-done-action" onClick={() => completePlan(focusItem)}>完成这一段 <span>↗</span></button>
            </div>

            {nextItem && nextItem.id !== focusItem.id && (
              <button className="zero-next" onClick={() => { setMobileQueueOpen(true); }}>
                <span>接下来</span>
                <strong>{clockLabel(nextItem.plannedStart)} · {nextItem.title}</strong>
                <i>→</i>
              </button>
            )}
          </section>
        ) : (
          <section className="zero-compose">
            <div className="zero-compose-intro">
              <span className="zero-overline">下一段 / NEXT</span>
              <h1>把时间交给<br/>一件具体的事。</h1>
              <p>不用整理整个人生。只决定下一段。</p>
            </div>

            <form className="zero-sentence" onSubmit={createPlan}>
              <div className="zero-mode" aria-label="开始方式">
                <button type="button" aria-pressed={startMode === "now"} onClick={() => setStartMode("now")}>现在开始</button>
                <button type="button" aria-pressed={startMode === "later"} onClick={selectLater}>排到稍后</button>
              </div>

              <div className="zero-sentence-row">
                <span>从</span>
                {startMode === "now"
                  ? <strong className="zero-now-word">现在</strong>
                  : <label className="zero-time-input"><span className="sr-only">开始时间</span><input type="time" value={draftTime} onChange={(event) => setDraftTime(event.target.value)} required/></label>}
                <span>开始</span>
              </div>

              <div className="zero-sentence-row">
                <span>留</span>
                <label className="zero-duration-input">
                  <span className="sr-only">持续分钟数</span>
                  <input type="number" min="5" max="480" step="5" value={draftDuration} onChange={(event) => setDraftDuration(Number(event.target.value))} required/>
                </label>
                <span>分钟</span>
              </div>

              <label className="zero-title-input">
                <span>只做</span>
                <input ref={titleInput} autoFocus value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={120} placeholder="写下一件事"/>
              </label>

              <div className="zero-duration-choices" aria-label="常用时长">
                {DURATIONS.map((duration) => (
                  <button type="button" key={duration} aria-pressed={draftDuration === duration} onClick={() => setDraftDuration(duration)}>
                    {duration}
                  </button>
                ))}
                <span>分钟</span>
              </div>

              <div className="zero-duration-beam" aria-hidden="true">
                <i style={{ "--beam": `${Math.min(100, Math.max(12, draftDuration / 1.2))}%` } as CSSProperties}/>
                <span>{startMode === "now" ? inputTime(new Date(now)) : draftTime}</span>
                <span>＋{draftDuration}m</span>
              </div>

              <button className="zero-submit" type="submit">
                <span>{startMode === "now" ? "开始这一段" : "放进今天"}</span>
                <i>→</i>
              </button>
            </form>
          </section>
        )}

        {mobileQueueOpen && <button className="zero-queue-scrim" onClick={() => setMobileQueueOpen(false)} aria-label="关闭今天的安排"/>}
        <aside className={`zero-queue ${mobileQueueOpen ? "is-open" : ""}`} aria-label="今天的安排">
          <header>
            <div><span>今天</span><strong>{todayItems.length ? `${todayItems.length} 段` : "还没有安排"}</strong></div>
            <div className="zero-queue-head-actions">
              <button className="zero-queue-new" onClick={openQueueDraft} aria-label="安排下一段">＋</button>
              <button className="zero-queue-close" onClick={() => setMobileQueueOpen(false)} aria-label="关闭今天的安排">×</button>
            </div>
          </header>

          {queueDraftOpen && (
            <form className="zero-queue-compose" onSubmit={createPlan}>
              <label><span>下一段做什么</span><input autoFocus value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={120} placeholder="一件具体的事"/></label>
              <div>
                <label><span>开始</span><input type="time" value={draftTime} onChange={(event) => setDraftTime(event.target.value)} required/></label>
                <label><span>分钟</span><input type="number" min="5" max="480" step="5" value={draftDuration} onChange={(event) => setDraftDuration(Number(event.target.value))} required/></label>
                <button type="submit">加入今天</button>
              </div>
            </form>
          )}

          <div className="zero-queue-list">
            {todayItems.length === 0 ? (
              <div className="zero-queue-empty"><i/><p>第一段会出现在这里。</p></div>
            ) : todayItems.map((item) => (
              <article key={item.id} className={`zero-queue-item is-${item.status}`}>
                <time>{clockLabel(item.plannedStart)}</time>
                <div>
                  <span>{statusLabel(item)} · {item.durationMinutes} 分钟</span>
                  <h2>{item.title}</h2>
                </div>
                <div className="zero-item-actions">
                  {item.status === "planned" && <button onClick={() => startPlan(item)}>开始</button>}
                  {item.status === "paused" && <button onClick={() => startPlan(item)}>继续</button>}
                  {item.status !== "active" && <button onClick={() => deletePlan(item)} aria-label={`移除 ${item.title}`}>×</button>}
                </div>
              </article>
            ))}
          </div>

          {focusItem && <p className="zero-queue-hint">完成当前这一段后，输入框会自动回来。</p>}
        </aside>
      </main>

      <button className="zero-mobile-queue" onClick={() => setMobileQueueOpen(true)}>
        <span>今天</span><b>{todayItems.length}</b>
      </button>
    </>
  );
}
