"use client";

import { useEffect } from "react";

export function SwRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      console.error(
        "[Push] Service workers not supported in this browser — push notifications will not work"
      );
      return;
    }

    navigator.serviceWorker.register("/sw.js").then(
      (reg) => console.log("[Push] Service worker registered, scope:", reg.scope),
      (err) => console.error("[Push] Service worker registration failed:", err)
    );
  }, []);

  return null;
}
