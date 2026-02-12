import { Suspense } from "react";
import { LiveDashboardContent } from "./live-dashboard-content";
import { LiveDashboardSkeleton } from "@/components/skeletons/live-dashboard-skeleton";

async function LiveDashboardWrapper({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveDashboardContent driveId={id} />;
}

export default function LiveDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<LiveDashboardSkeleton />}>
      <LiveDashboardWrapper params={params} />
    </Suspense>
  );
}
