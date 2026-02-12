import { Suspense } from "react";
import { DutyRulesContent } from "./duty-rules-content";
import { Loader2 } from "lucide-react";

function DutyRulesSkeleton() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

async function DutyRulesWrapper({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DutyRulesContent dutyId={id} />;
}

export default function DutyCapacityRulesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<DutyRulesSkeleton />}>
      <DutyRulesWrapper params={params} />
    </Suspense>
  );
}
