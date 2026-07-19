import { Suspense } from "react";
import { getWeeksAction } from "./weeks.actions";
import { WeeksBoard } from "./_components/weeks-board";
import { Button } from "@/components/ui/button";
import { Plus } from "@/components/ui/themed-icons";
import Link from "next/link";

export default async function SchedulePage() {
  const [data] = await getWeeksAction();
  const weeks = data?.weeks || [];

  return (
    <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-col sm:flex-row gap-4 items-center sm:justify-between justify-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-center sm:text-left text-mystic-900 dark:text-cream-100">Food Schedule</h1>
            <p className="text-mystic-700 dark:text-cream-200">Organize your meal planning by week</p>
          </div>
          <Button asChild>
            <Link href="/schedule/create">
              <Plus className="h-4 w-4 mr-2 dark:text-cream-100" />
              New Week
            </Link>
          </Button>
        </div>

      <Suspense fallback={<div>Loading...</div>}>
        <WeeksBoard weeks={weeks} />
      </Suspense>
    </div>
  );
}
