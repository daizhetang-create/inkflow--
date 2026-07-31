"use client";

import { useEffect } from "react";
import type { Viewer } from "./attention/types";
import { PlannerView } from "./planner/PlannerView";

export function AttentionApp({ viewer }: { viewer: Viewer }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  return (
    <div className="zero-app">
      <a className="zero-skip" href="#inkflow-main">跳到主要内容</a>
      <PlannerView viewer={viewer}/>
    </div>
  );
}
