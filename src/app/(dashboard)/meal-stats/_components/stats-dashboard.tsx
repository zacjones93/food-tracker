"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

// Infer the return type from the action
type MealStats = {
  topRecipesAllTime: Array<{ id: string; name: string; emoji: string | null; mealType: string | null; mealsEatenCount: number }>;
  topRecipesThisYear: Array<{ id: string; name: string; emoji: string | null; mealType: string | null; timesScheduled: number }>;
  topRecipesThisMonth: Array<{ id: string; name: string; emoji: string | null; mealType: string | null; timesScheduled: number }>;
  topDinners: Array<{ id: string; name: string; emoji: string | null; mealType: string | null; mealsEatenCount: number }>;
  mostRepeatedInMonth: { recipe: { id: string; name: string; emoji: string | null; mealType: string | null; timesScheduled: number }; month: string } | null;
  mostUsedIngredients: Array<{ name: string; count: number }>;
  mostPurchasedGroceryItems: Array<{ name: string; count: number; category: string | null }>;
  topGroceryByCategory: Record<string, Array<{ name: string; count: number; category: string | null }>>;
  alwaysOnTheList: Array<{ name: string; count: number; category: string | null }>;
  busiestCookingDay: { day: string; count: number } | null;
  avgMealsPerWeek: number;
  newRecipesTriedThisYear: number;
  newRecipesTriedThisMonth: number;
  cookbookLeaderboard: Array<{ id: string; name: string; recipeCount: number; totalMealsEaten: number }>;
  mealTypeBreakdown: Array<{ mealType: string; count: number }>;
  difficultyBreakdown: Array<{ difficulty: string; count: number }>;
  topTags: Array<{ tag: string; count: number }>;
  mostPopularSides: Array<{ id: string; name: string; emoji: string | null; mealType: string | null; mealsEatenCount: number }>;
  favoritePairings: Array<{ mainId: string; mainName: string; mainEmoji: string | null; sideId: string; sideName: string; sideEmoji: string | null; relationType: string }>;
  recipesAddedByMonth: Array<{ monthLabel: string; weeksCreated: number }>;
  forgottenFavorites: Array<{ id: string; name: string; emoji: string | null; mealsEatenCount: number; lastMadeDate: Date | null; daysSinceLastMade: number | null }>;
  weeklyPlanningByMonth: Array<{ monthLabel: string; weeksCreated: number }>;
  emojiLeaderboard: Array<{ emoji: string; count: number }>;
  avgGroceryListLength: number;
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

export function StatsDashboard({ stats }: { stats: MealStats }) {
  const maxAllTime = stats.topRecipesAllTime[0]?.mealsEatenCount || 1;
  const maxIngredient = stats.mostUsedIngredients[0]?.count || 1;
  const maxGrocery = stats.mostPurchasedGroceryItems[0]?.count || 1;
  const maxTag = stats.topTags[0]?.count || 1;
  const maxMealType = stats.mealTypeBreakdown[0]?.count || 1;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Summary Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatNumber label="Total Recipes" value={stats.totalRecipes} />
        <StatNumber label="Total Meals Eaten" value={stats.totalMealsEaten} />
        <StatNumber label="Weeks Planned" value={stats.totalWeeksPlanned} />
        <StatNumber label="Avg Meals / Week" value={stats.avgMealsPerWeek} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatNumber
          label="New Recipes This Year"
          value={stats.newRecipesTriedThisYear}
        />
        <StatNumber
          label="New Recipes This Month"
          value={stats.newRecipesTriedThisMonth}
        />
        <StatNumber
          label="Busiest Day"
          value={stats.busiestCookingDay?.day || "N/A"}
          sub={stats.busiestCookingDay ? `${stats.busiestCookingDay.count} meals scheduled` : undefined}
        />
        <StatNumber
          label="Avg Grocery List"
          value={`${stats.avgGroceryListLength} items`}
        />
      </div>

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

      {/* ── Ingredient & Grocery Stats ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Most Used Ingredients (Across Recipes)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.mostUsedIngredients.length === 0 && <p className="text-sm text-mystic-500">No ingredient data</p>}
            {stats.mostUsedIngredients.map((ing) => (
              <div key={ing.name} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm capitalize truncate">{ing.name}</p>
                  <BarSegment value={ing.count} max={maxIngredient} color="bg-emerald-500" />
                </div>
                <span className="text-xs font-mono text-mystic-500">{ing.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Most Purchased Grocery Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.mostPurchasedGroceryItems.length === 0 && <p className="text-sm text-mystic-500">No grocery data</p>}
            {stats.mostPurchasedGroceryItems.map((item) => (
              <div key={item.name} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm capitalize truncate">{item.name}</p>
                  <BarSegment value={item.count} max={maxGrocery} color="bg-amber-500" />
                </div>
                {item.category && <Badge variant="outline" className="text-xs shrink-0">{item.category}</Badge>}
                <span className="text-xs font-mono text-mystic-500">{item.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Always On The List & Top Grocery by Category ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Always on the List</CardTitle>
            <p className="text-xs text-mystic-500">Items appearing in 50%+ of grocery weeks</p>
          </CardHeader>
          <CardContent>
            {stats.alwaysOnTheList.length === 0 && <p className="text-sm text-mystic-500">Not enough data yet</p>}
            <div className="flex flex-wrap gap-2">
              {stats.alwaysOnTheList.map((item) => (
                <Badge key={item.name} variant="secondary" className="capitalize">
                  {item.name} ({item.count}w)
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Grocery Items by Category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.keys(stats.topGroceryByCategory).length === 0 && <p className="text-sm text-mystic-500">No categorized items</p>}
            {Object.entries(stats.topGroceryByCategory).map(([cat, items]) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-mystic-600 dark:text-cream-300 uppercase tracking-wide mb-1">{cat}</p>
                <div className="flex flex-wrap gap-1">
                  {items.map((item) => (
                    <Badge key={item.name} variant="outline" className="text-xs capitalize">
                      {item.name} ({item.count})
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Meal Type & Difficulty & Tags ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Meal Type Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.mealTypeBreakdown.map((mt) => (
              <div key={mt.mealType} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{mt.mealType}</p>
                  <BarSegment value={mt.count} max={maxMealType} color="bg-violet-500" />
                </div>
                <span className="text-xs font-mono text-mystic-500">{mt.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Difficulty Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.difficultyBreakdown.map((d) => (
              <div key={d.difficulty} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{d.difficulty}</p>
                  <BarSegment value={d.count} max={stats.difficultyBreakdown[0]?.count || 1} color="bg-rose-400" />
                </div>
                <span className="text-xs font-mono text-mystic-500">{d.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tag Cloud</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topTags.length === 0 && <p className="text-sm text-mystic-500">No tags used yet</p>}
            <div className="flex flex-wrap gap-2">
              {stats.topTags.map((t) => {
                // Scale font size based on count
                const scale = maxTag > 0 ? 0.75 + (t.count / maxTag) * 0.75 : 1;
                return (
                  <span
                    key={t.tag}
                    className="text-mystic-700 dark:text-cream-200 hover:text-mystic-900 dark:hover:text-cream-100 transition-colors cursor-default"
                    style={{ fontSize: `${scale}rem` }}
                  >
                    {t.tag} <sup className="text-mystic-400 text-[0.6em]">{t.count}</sup>
                  </span>
                );
              })}
            </div>
          </CardContent>
        </Card>
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

      {/* ── Sides & Pairings ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {stats.mostPopularSides.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Most Popular Side Dishes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.mostPopularSides.map((r, i) => (
                <div key={r.id} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-mystic-500 w-5 text-right">{i + 1}.</span>
                  <p className="text-sm font-medium flex-1 truncate">
                    <RecipeLink id={r.id} name={r.name} emoji={r.emoji} />
                  </p>
                  <Badge variant="secondary">{r.mealsEatenCount} pairings</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {stats.favoritePairings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Favorite Pairings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.favoritePairings.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="truncate">
                    <RecipeLink id={p.mainId} name={p.mainName} emoji={p.mainEmoji} />
                  </span>
                  <Badge variant="outline" className="text-xs shrink-0">{p.relationType}</Badge>
                  <span className="truncate">
                    <RecipeLink id={p.sideId} name={p.sideName} emoji={p.sideEmoji} />
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

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
    </div>
  );
}
