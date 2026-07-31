"use client";

import { useSyncExternalStore } from "react";
import { AttentionApp } from "./AttentionApp";

const subscribe = () => () => undefined;

function LoadingShell() {
  return (
    <div className="personal-app personal-loading" aria-busy="true">
      <header className="personal-topbar">
        <span className="app-mark"><i/>墨流</span>
      </header>
      <main className="personal-loading-main">
        <span>正在接回今天</span>
        <i/>
      </main>
    </div>
  );
}

export function AttentionRoot() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return mounted ? <AttentionApp/> : <LoadingShell/>;
}
