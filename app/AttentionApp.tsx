"use client";

import { useEffect } from "react";
import { DailyApp } from "./personal/DailyApp";

export function AttentionApp() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  return (
    <DailyApp/>
  );
}
