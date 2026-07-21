import { notFound } from "next/navigation";
import Link from "next/link";
import { getWeekByIdAction } from "../../weeks.actions";
import { WeekForm } from "../../_components/week-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "@/components/ui/themed-icons";

interface EditWeekPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditWeekPage({ params }: EditWeekPageProps) {
  const { id } = await params;
  const [data, error] = await getWeekByIdAction({ id });

  if (error || !data?.week) notFound();

  const { week } = data;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-mystic-900 dark:text-cream-100">
            Edit Week
          </h1>
          <p className="text-mystic-700 dark:text-cream-200">
            Update the details for {week.emoji || "📅"} {week.name}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/schedule/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-2 dark:text-cream-200" />
            Back to Week
          </Link>
        </Button>
      </div>

      <WeekForm
        mode="edit"
        weekId={id}
        initialValues={{
          name: week.name,
          emoji: week.emoji,
          status: week.status,
          startDate: week.startDate ? new Date(week.startDate) : null,
          endDate: week.endDate ? new Date(week.endDate) : null,
          weekNumber: week.weekNumber,
        }}
      />
    </div>
  );
}
