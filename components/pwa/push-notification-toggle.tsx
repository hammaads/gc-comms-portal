"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type SubscriptionState = "loading" | "subscribed" | "unsubscribed" | "denied" | "unsupported";

export function PushNotificationToggle() {
  const [state, setState] = useState<SubscriptionState>("loading");

  useEffect(() => {
    if (!("PushManager" in window) || !("serviceWorker" in navigator)) {
      setState("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setState(sub ? "subscribed" : "unsubscribed");
      });
    });
  }, []);

  async function subscribe() {
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("denied");
        return;
      }
      if (permission !== "granted") return;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      });

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        }),
      });

      if (res.ok) {
        setState("subscribed");
      }
    } catch (err) {
      console.error("[push] subscribe failed:", err);
    }
  }

  async function unsubscribe() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setState("unsubscribed");
        return;
      }

      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });

      await sub.unsubscribe();
      setState("unsubscribed");
    } catch (err) {
      console.error("[push] unsubscribe failed:", err);
    }
  }

  if (state === "unsupported" || state === "loading") return null;

  const isSubscribed = state === "subscribed";
  const isDenied = state === "denied";

  const button = (
    <button
      type="button"
      onClick={isSubscribed ? unsubscribe : subscribe}
      disabled={isDenied}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-sm font-medium text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
      aria-label={
        isDenied
          ? "Push notifications blocked"
          : isSubscribed
            ? "Disable push notifications"
            : "Enable push notifications"
      }
    >
      {isSubscribed ? (
        <Bell className="h-4 w-4" />
      ) : (
        <BellOff className="h-4 w-4" />
      )}
    </button>
  );

  if (isDenied) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>Notifications blocked in browser settings</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}
