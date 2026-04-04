"use client";

import { useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const WordCloud = dynamic(() => import("react-d3-cloud"), { ssr: false });

// Infer the return type from the action
type MealStats = {
  topRecipesAllTime: Array<{ id: string; name: string; emoji: string | null; mealType: string | null; mealsEatenCount: number }>;
  topRecipesThisYear: Array<{ id: string; name: string; emoji: string | null; mealType: string | null; timesScheduled: number }>;
  topRecipesThisMonth: Array<{ id: string; name: string; emoji: string | null; mealType: string | null; timesScheduled: number }>;
  topDinners: Array<{ id: string; name: string; emoji: string | null; mealType: string | null; mealsEatenCount: number }>;
  mostRepeatedInMonth: { recipe: { id: string; name: string; emoji: string | null; mealType: string | null; timesScheduled: number }; month: string } | null;
  avgMealsPerWeek: number;
  newRecipesTriedThisYear: number;
  newRecipesTriedThisMonth: number;
  cookbookLeaderboard: Array<{ id: string; name: string; recipeCount: number; totalMealsEaten: number }>;
  topTags: Array<{ tag: string; count: number }>;
  recipesAddedByMonth: Array<{ monthLabel: string; weeksCreated: number }>;
  forgottenFavorites: Array<{ id: string; name: string; emoji: string | null; mealsEatenCount: number; lastMadeDate: Date | null; daysSinceLastMade: number | null }>;
  weeklyPlanningByMonth: Array<{ monthLabel: string; weeksCreated: number }>;
  emojiLeaderboard: Array<{ emoji: string; count: number }>;
  totalRecipes: number;
  totalWeeksPlanned: number;
  totalMealsEaten: number;
};

function formatMonth(monthLabel: string): string {
  const [year, month] = monthLabel.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// Simple horizontal bar for visual proportion
function BarSegment({ value, max, color = "bg-mystic-500" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full bg-cream-200 dark:bg-mystic-800 rounded-full h-2.5">
      <div className={`${color} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatNumber({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-mystic-600 dark:text-cream-300">{label}</p>
        <p className="text-3xl font-bold text-mystic-900 dark:text-cream-100 mt-1">{value}</p>
        {sub && <p className="text-xs text-mystic-500 dark:text-cream-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function RecipeLink({ id, name, emoji }: { id: string; name: string; emoji: string | null }) {
  return (
    <Link href={`/recipes/${id}`} className="hover:text-mystic-600 dark:hover:text-cream-200 transition-colors">
      {emoji && <span className="mr-1">{emoji}</span>}{name}
    </Link>
  );
}

function TagCloudResponsive({ tags }: { tags: Array<{ tag: string; count: number }> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const height = Math.max(200, width * 0.5);

  return (
    <div ref={containerRef}>
      {/* Mobile: simple tag list */}
      <div className="flex flex-wrap gap-2 sm:hidden">
        {tags.map((t) => (
          <Badge key={t.tag} variant="secondary" className="text-xs">
            {t.tag} ({t.count})
          </Badge>
        ))}
      </div>
      {/* Desktop: word cloud */}
      <div className="hidden sm:block">
        {width > 0 && (
          <WordCloud
            data={tags.map(t => ({ text: t.tag, value: t.count }))}
            width={width}
            height={height}
            font="inherit"
            fontSize={(word) => 10 + Math.sqrt(word.value) * 8}
            rotate={() => 0}
            padding={8}
            fill={() => "currentColor"}
          />
        )}
      </div>
    </div>
  );
}

export function StatsDashboard({ stats }: { stats: MealStats }) {
  const maxAllTime = stats.topRecipesAllTime[0]?.mealsEatenCount || 1;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Summary Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatNumber label="Total Recipes" value={stats.totalRecipes} />
        <StatNumber label="Total Meals Eaten" value={stats.totalMealsEaten} />
        <StatNumber label="Weeks Planned" value={stats.totalWeeksPlanned} />
        <StatNumber label="Avg Meals / Week" value={stats.avgMealsPerWeek} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatNumber
          label="New Recipes This Year"
          value={stats.newRecipesTriedThisYear}
        />
        <StatNumber
          label="New Recipes This Month"
          value={stats.newRecipesTriedThisMonth}
        />
      </div>

      {/* ── Emoji Leaderboard ───────────────────────────────────────── */}
      {stats.emojiLeaderboard.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Emoji Leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {stats.emojiLeaderboard.map((e, i) => (
                <div key={e.emoji} className="flex flex-col items-center gap-1">
                  <span className="text-3xl">{e.emoji}</span>
                  <span className="text-xs font-mono text-mystic-500">{e.count}</span>
                  {i === 0 && <Badge className="text-[0.6rem]">1st</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Most Eaten Recipes (All Time / Year / Month) ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Most Eaten (All Time)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.topRecipesAllTime.length === 0 && <p className="text-sm text-mystic-500">No data yet</p>}
            {stats.topRecipesAllTime.map((r, i) => (
              <div key={r.id} className="flex items-center gap-3">
                <span className="text-xs font-mono text-mystic-500 w-5 text-right">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    <RecipeLink id={r.id} name={r.name} emoji={r.emoji} />
                  </p>
                  <BarSegment value={r.mealsEatenCount} max={maxAllTime} />
                </div>
                <span className="text-sm font-semibold text-mystic-700 dark:text-cream-200">{r.mealsEatenCount}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Most Eaten (This Year)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.topRecipesThisYear.length === 0 && <p className="text-sm text-mystic-500">No data yet</p>}
            {stats.topRecipesThisYear.map((r, i) => (
              <div key={r.id} className="flex items-center gap-3">
                <span className="text-xs font-mono text-mystic-500 w-5 text-right">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    <RecipeLink id={r.id} name={r.name} emoji={r.emoji} />
                  </p>
                  <BarSegment value={r.timesScheduled} max={stats.topRecipesThisYear[0]?.timesScheduled || 1} color="bg-mystic-400" />
                </div>
                <span className="text-sm font-semibold text-mystic-700 dark:text-cream-200">{r.timesScheduled}x</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Most Eaten (This Month)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.topRecipesThisMonth.length === 0 && <p className="text-sm text-mystic-500">No data yet</p>}
            {stats.topRecipesThisMonth.map((r, i) => (
              <div key={r.id} className="flex items-center gap-3">
                <span className="text-xs font-mono text-mystic-500 w-5 text-right">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    <RecipeLink id={r.id} name={r.name} emoji={r.emoji} />
                  </p>
                  <BarSegment value={r.timesScheduled} max={stats.topRecipesThisMonth[0]?.timesScheduled || 1} color="bg-mystic-300" />
                </div>
                <span className="text-sm font-semibold text-mystic-700 dark:text-cream-200">{r.timesScheduled}x</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Top Dinners & Most Repeated ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top 5 Dinners</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.topDinners.length === 0 && <p className="text-sm text-mystic-500">No dinners tracked yet</p>}
            {stats.topDinners.map((r, i) => (
              <div key={r.id} className="flex items-center gap-3">
                <span className="text-xs font-mono text-mystic-500 w-5 text-right">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    <RecipeLink id={r.id} name={r.name} emoji={r.emoji} />
                  </p>
                </div>
                <Badge variant="secondary">{r.mealsEatenCount} times</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {stats.mostRepeatedInMonth && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Most Repeated in a Single Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <span className="text-4xl">{stats.mostRepeatedInMonth.recipe.emoji || "🍽️"}</span>
                <div>
                  <p className="font-semibold text-lg">
                    <RecipeLink
                      id={stats.mostRepeatedInMonth.recipe.id}
                      name={stats.mostRepeatedInMonth.recipe.name}
                      emoji={null}
                    />
                  </p>
                  <p className="text-sm text-mystic-600 dark:text-cream-300">
                    Made <span className="font-bold">{stats.mostRepeatedInMonth.recipe.timesScheduled} times</span> in {formatMonth(stats.mostRepeatedInMonth.month)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Cookbook Leaderboard ──────────────────────────────────────── */}
      {stats.cookbookLeaderboard.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cookbook Leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.cookbookLeaderboard.map((book, i) => (
                <div key={book.id} className="flex items-start gap-3 p-3 rounded-lg bg-cream-50 dark:bg-mystic-800/50">
                  <span className="text-2xl font-bold text-mystic-300">{i + 1}</span>
                  <div>
                    <p className="font-medium text-sm text-mystic-900 dark:text-cream-100">{book.name}</p>
                    <p className="text-xs text-mystic-500 mt-0.5">{book.recipeCount} recipes &middot; {book.totalMealsEaten} meals eaten</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Forgotten Favorites ──────────────────────────────────────── */}
      {stats.forgottenFavorites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Forgotten Favorites</CardTitle>
            <p className="text-xs text-mystic-500">Recipes you loved but haven&apos;t made in 60+ days</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stats.forgottenFavorites.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-cream-50 dark:bg-mystic-800/50">
                  <span className="text-2xl">{r.emoji || "🍽️"}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      <RecipeLink id={r.id} name={r.name} emoji={null} />
                    </p>
                    <p className="text-xs text-mystic-500">
                      Made {r.mealsEatenCount}x &middot; Last made {r.daysSinceLastMade} days ago
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Time-Based Trends ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recipes Added by Month</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recipesAddedByMonth.length === 0 && <p className="text-sm text-mystic-500">No data</p>}
            <div className="space-y-1">
              {stats.recipesAddedByMonth.map((m) => {
                const max = Math.max(...stats.recipesAddedByMonth.map(x => x.weeksCreated));
                return (
                  <div key={m.monthLabel} className="flex items-center gap-3">
                    <span className="text-xs text-mystic-500 w-20 shrink-0">{formatMonth(m.monthLabel)}</span>
                    <div className="flex-1">
                      <BarSegment value={m.weeksCreated} max={max} color="bg-sky-500" />
                    </div>
                    <span className="text-xs font-mono text-mystic-500 w-6 text-right">{m.weeksCreated}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Weeks Planned by Month</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.weeklyPlanningByMonth.length === 0 && <p className="text-sm text-mystic-500">No data</p>}
            <div className="space-y-1">
              {stats.weeklyPlanningByMonth.map((m) => {
                const max = Math.max(...stats.weeklyPlanningByMonth.map(x => x.weeksCreated));
                return (
                  <div key={m.monthLabel} className="flex items-center gap-3">
                    <span className="text-xs text-mystic-500 w-20 shrink-0">{formatMonth(m.monthLabel)}</span>
                    <div className="flex-1">
                      <BarSegment value={m.weeksCreated} max={max} color="bg-teal-500" />
                    </div>
                    <span className="text-xs font-mono text-mystic-500 w-6 text-right">{m.weeksCreated}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tag Cloud ──────────────────────────────────────────────── */}
      {stats.topTags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tag Cloud</CardTitle>
          </CardHeader>
          <CardContent>
            <TagCloudResponsive tags={stats.topTags} />
          </CardContent>
        </Card>
      )}

    </div>
  );
}
