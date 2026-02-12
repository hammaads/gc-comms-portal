import { Suspense } from "react";
import { CallCenterContent } from "./call-center-content";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

function CallCenterSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full mb-2" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

async function CallCenterWrapper({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CallCenterContent driveId={id} />;
}

export default function CallCenterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<CallCenterSkeleton />}>
      <CallCenterWrapper params={params} />
    </Suspense>
  );
}
