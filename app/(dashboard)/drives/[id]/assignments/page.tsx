import { Suspense } from "react";
import { AssignmentsContent } from "./assignments-content";
import { DutyBoardSkeleton } from "@/components/skeletons/duty-board-skeleton";

async function AssignmentsWrapper({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssignmentsContent driveId={id} />;
}

export default function AssignmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<DutyBoardSkeleton />}>
      <AssignmentsWrapper params={params} />
    </Suspense>
  );
}
