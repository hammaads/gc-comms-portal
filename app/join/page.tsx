import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function JoinPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "luma")
    .single();

  const lumaUrl = (data?.value as Record<string, unknown>)?.calendar_url as
    | string
    | undefined;

  if (lumaUrl) {
    redirect(lumaUrl);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">Grand Citizens</h1>
        <p className="text-muted-foreground">
          Volunteer registration is not open yet. Please check back later.
        </p>
      </div>
    </div>
  );
}
