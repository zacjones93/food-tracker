import { notFound } from "next/navigation";
import type { Route } from "next";
import { getWeekByIdAction } from "../weeks.actions";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Pencil } from "@/components/ui/themed-icons";
import Link from "next/link";
import { WeekRecipesList } from "./_components/week-recipes-list";
import { CategorizedGroceryList } from "./_components/categorized-grocery-list";
import { WeekStatusSelector } from "./_components/week-status-selector";
import { AssistantPageContext } from "@/components/assistant/assistant-provider";
import { Suspense } from "react";
import { WeekDetailSkeleton } from "../_components/schedule-skeletons";

interface ScheduleDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ScheduleDetailPage({ params }: ScheduleDetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<WeekDetailSkeleton />}>
      <ScheduleDetailContent id={id} />
    </Suspense>
  );
}

async function ScheduleDetailContent({ id }: { id: string }) {
  const [data, error] = await getWeekByIdAction({ id });

  if (error || !data?.week) {
    notFound();
  }

  const { week } = data;

  return (
    <>
      <AssistantPageContext
        context={{
          kind: "week",
          entityId: week.id,
          label: week.name,
          href: `/schedule/${week.id}`,
        }}
      />
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3 justify-center sm:justify-start">
              <h1 className="text-3xl font-bold tracking-tight whitespace-nowrap text-mystic-900 dark:text-cream-100">
                {week.emoji || "📅"} {week.name}
              </h1>
              <WeekStatusSelector
                weekId={week.id}
                currentStatus={week.status as "current" | "upcoming" | "archived"}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/schedule">
                <ArrowLeft className="h-4 w-4 mr-2 dark:text-cream-200" />
                Back to Schedule
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/schedule/${week.id}/edit` as Route}>
                <Pencil className="h-4 w-4 mr-2 dark:text-cream-200" />
                Edit
              </Link>
            </Button>
          </div>
        </div>

        <div className="space-y-8">
          {/* Recipes Section */}
          <section>
            <h2 className="text-2xl font-semibold mb-4 text-mystic-900 dark:text-cream-100">
              Recipes
            </h2>
            <WeekRecipesList
              weekId={week.id}
              recipes={week.recipes}
              weekStartDate={week.startDate}
              weekEndDate={week.endDate}
            />
          </section>

          {/* Grocery List Section */}
          <section>
            <h2 className="text-2xl font-semibold mb-4 text-mystic-900 dark:text-cream-100">
              Grocery List
            </h2>
            <CategorizedGroceryList
              weekId={week.id}
              items={week.groceryItems || []}
            />
          </section>
        </div>
      </div>
    </>
  );
}
