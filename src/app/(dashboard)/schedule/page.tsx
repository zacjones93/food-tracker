import { Suspense } from "react";
import { getWeeksAction } from "./weeks.actions";
import { WeeksBoard } from "./_components/weeks-board";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default async function SchedulePage() {
  const [data] = await getWeeksAction();
  const weeks = data?.weeks || [];

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </div>
      </header>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Food Schedule</h1>
            <p className="text-muted-foreground">Organize your meal planning by week</p>
          </div>
          <Button asChild>
            <Link href="/schedule/create">
              <Plus className="h-4 w-4 mr-2" />
              New Week
            </Link>
          </Button>
        </div>

        <Suspense fallback={<div>Loading...</div>}>
          <WeeksBoard weeks={weeks} />
        </Suspense>
      </div>
    </>
  );
}
