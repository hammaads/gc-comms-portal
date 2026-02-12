import { Suspense } from "react";
import { DriveDetailContent } from "./drive-detail-content";
import { DriveDetailSkeleton } from "@/components/skeletons/drive-detail-skeleton";

async function DriveDetailWrapper({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DriveDetailContent id={id} />;
}

export default function DriveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<DriveDetailSkeleton />}>
      <DriveDetailWrapper params={params} />
    </Suspense>
  );
}
