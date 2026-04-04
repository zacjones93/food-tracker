import { Suspense } from "react";
import { getMealStatsAction } from "./meal-stats.actions";
import { StatsDashboard } from "./_components/stats-dashboard";

async function StatsContent() {
  const [data] = await getMealStatsAction();

  if (!data) {
    return <p className="text-mystic-500 text-center py-12">Unable to load stats. Make sure you have a team selected.</p>;
  }

  return <StatsDashboard stats={data} />;
}

export default function MealStatsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-center sm:text-left text-mystic-900 dark:text-cream-100">
          Meal Stats
        </h1>
        <p className="text-mystic-700 dark:text-cream-200">
          Insights into your cooking habits, favorite recipes, and grocery trends
        </p>
      </div>

      <Suspense fallback={<div className="flex justify-center py-12 text-mystic-500">Loading stats...</div>}>
        <StatsContent />
      </Suspense>
    </div>
  );
}
