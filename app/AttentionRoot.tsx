"use client";

import { useSyncExternalStore } from "react";
import { AttentionApp } from "./AttentionApp";
import type { Viewer } from "./attention/types";

const subscribe = () => () => undefined;

function LoadingShell() {
  return (
    <div className="zero-app zero-loading" aria-busy="true">
      <header className="zero-topbar">
        <div className="zero-brand"><span>墨</span><strong>墨流</strong></div>
        <span className="zero-loading-state">正在接回今天</span>
      </header>
      <main className="zero-loading-main">
        <span>今天</span>
        <h1>把下一段时间，<br/>交给一件事。</h1>
        <i/>
      </main>
    </div>
  );
}

export function AttentionRoot({ viewer }: { viewer: Viewer }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return mounted ? <AttentionApp viewer={viewer}/> : <LoadingShell/>;
}
