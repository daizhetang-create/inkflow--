"use client";

import { useSyncExternalStore } from "react";
import { FlowApp } from "./FlowApp";

const subscribe = () => () => {};

function DeterministicShell() {
  return (
    <div className="flow-app shell-loading" aria-busy="true">
      <aside className="app-rail" aria-label="墨流导航">
        <div className="wordmark"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 12h6M14 12h6"/><circle cx="12" cy="12" r="2.2"/></svg><span>墨流</span></div>
        <div className="rail-track"><i className="rail-progress"/></div>
        <span className="version">VN / 01</span>
      </aside>
      <main id="flow-main" className="flow-main">
        <header className="topbar"><div className="topbar-state"><span className="signal-dot"/> ATTENTION CONTINUITY / LOCAL FIRST</div></header>
        <div className="flow-line" aria-hidden="true"><span/><span className="line-core"><i/></span><span/></div>
        <section className="scene">
          <p className="eyebrow">RETURN GATE / LOADING</p>
          <h1>先写下回来后<br/><em>要做的第一步。</em></h1>
          <p className="lede">正在接回这台设备上的本地快照。墨流不会把你的动作发送到服务器。</p>
        </section>
      </main>
    </div>
  );
}

export function FlowRoot() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return mounted ? <FlowApp /> : <DeterministicShell />;
}
