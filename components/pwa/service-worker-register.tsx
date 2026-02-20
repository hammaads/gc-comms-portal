"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => {
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
              registration.update();
            }
          });
        });
    }
  }, []);

  return null;
}
