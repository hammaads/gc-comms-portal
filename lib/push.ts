import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

webpush.setVapidDetails(
  "mailto:tech@grandcitizens.org",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function sendPushNotificationToAll({
  title,
  body,
  url,
}: {
  title: string;
  body: string;
  url: string;
}) {
  const supabase = createAdminClient();

  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh_key, auth_key");

  if (error || !subscriptions || subscriptions.length === 0) return;

  const payload = JSON.stringify({ title, body, url });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
        },
        payload,
      ),
    ),
  );

  // Clean up stale subscriptions (410 Gone or 404 Not Found)
  const staleIds: string[] = [];
  results.forEach((result, i) => {
    if (
      result.status === "rejected" &&
      result.reason?.statusCode &&
      (result.reason.statusCode === 410 || result.reason.statusCode === 404)
    ) {
      staleIds.push(subscriptions[i].id);
    }
  });

  if (staleIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", staleIds);
  }
}
