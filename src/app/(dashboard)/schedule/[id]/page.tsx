import { notFound } from "next/navigation";
import { getWeekByIdAction } from "../weeks.actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { WeekRecipesList } from "./_components/week-recipes-list";
import { CategorizedGroceryList } from "./_components/categorized-grocery-list";
import { WeekStatusSelector } from "./_components/week-status-selector";

interface ScheduleDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ScheduleDetailPage({ params }: ScheduleDetailPageProps) {
  const { id } = await params;
  const [data, error] = await getWeekByIdAction({ id });

  if (error || !data?.week) {
    notFound();
  }

  const { week } = data;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title={`${week.emoji || '📅'} ${week.name}`}
          description={week.status === 'current' ? 'Current week' : week.status === 'upcoming' ? 'Upcoming week' : 'Archived week'}
        >
          <Link href="/schedule">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Schedule
            </Button>
          </Link>
        </PageHeader>
        <WeekStatusSelector weekId={week.id} currentStatus={week.status} />
      </div>

      <div className="space-y-8">
        {/* Recipes Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Recipes</h2>
          <WeekRecipesList weekId={week.id} recipes={week.recipes} />
        </section>

        {/* Grocery List Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Grocery List</h2>
          <CategorizedGroceryList weekId={week.id} items={week.groceryItems || []} />
        </section>
      </div>
    </div>
  );
}
