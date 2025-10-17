import { Suspense } from "react";
import { getWeeksAction } from "./weeks.actions";
import { WeeksBoard } from "./_components/weeks-board";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default async function SchedulePage() {
  const [data] = await getWeeksAction();
  const weeks = data?.weeks || [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Food Schedule"
        description="Organize your meal planning by week"
      >
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Week
        </Button>
      </PageHeader>

      <Suspense fallback={<div>Loading...</div>}>
        <WeeksBoard weeks={weeks} />
      </Suspense>
    </div>
  );
}
