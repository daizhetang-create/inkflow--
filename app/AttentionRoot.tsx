"use client";

import { useSyncExternalStore } from "react";
import { AttentionApp } from "./AttentionApp";
import type { Viewer } from "./attention/types";

const subscribe = () => () => undefined;

function LoadingShell() {
  return (
    <div className="attention-app loading-shell" aria-busy="true">
      <aside className="app-sidebar">
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span><strong>墨流</strong></div>
        <div className="loading-rule"/>
      </aside>
      <main className="app-main">
        <header className="app-header"><span>正在接回今天的计划</span><i/></header>
        <section className="now-empty">
          <p className="kicker">此刻 / NOW</p>
          <h1>今天，<br/>准备从哪一段开始？</h1>
          <p>正在读取这台设备上的时间安排，并与云端核对。</p>
        </section>
      </main>
    </div>
  );
}

export function AttentionRoot({ viewer }: { viewer: Viewer }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return mounted ? <AttentionApp viewer={viewer}/> : <LoadingShell/>;
}
