"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already installed as standalone
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Don't show if dismissed this session
    if (sessionStorage.getItem("pwa-install-dismissed")) {
      setDismissed(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem("pwa-install-dismissed", "1");
    setDismissed(true);
  };

  return (
    <div className="mx-4 mt-2 flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-2 sm:mx-6">
      <div className="flex items-center gap-2 text-sm">
        <Download className="h-4 w-4 shrink-0" />
        <span>Install this app for a better experience</span>
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="default" onClick={handleInstall}>
          Install
        </Button>
        <Button size="icon" variant="ghost" onClick={handleDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
