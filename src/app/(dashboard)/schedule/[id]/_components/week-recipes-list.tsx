"use client";

import { useState, useEffect, useMemo } from "react";
import { type Recipe, type WeekRecipe } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { format, eachDayOfInterval, parseISO } from "date-fns";

type RelatedRecipe = Pick<Recipe, 'id' | 'name' | 'emoji'> & { relationType: string };
type RecipeWithRelated = Recipe & { relatedRecipes?: RelatedRecipe[] };
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RELATION_TYPES } from "@/schemas/recipe-relation.schema";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  pointerWithin,
  useDroppable,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp,
} from "@/components/ui/themed-icons";
import { useServerAction } from "zsa-react";
import {
  reorderWeekRecipesAction,
  removeRecipeFromWeekAction,
  toggleWeekRecipeMadeAction,
  updateWeekRecipeScheduledDateAction,
} from "../../weeks.actions";
import { toast } from "sonner";
import { AddRecipeDialog } from "./add-recipe-dialog";
import { BrowseRecipesByTag } from "./browse-recipes-by-tag";
import { useRouter } from "next/navigation";

interface WeekRecipesListProps {
  weekId: string;
  recipes: (WeekRecipe & { recipe: RecipeWithRelated })[];
  embedded?: boolean;
  weekStartDate?: Date | null;
  weekEndDate?: Date | null;
}

export function WeekRecipesList({
  weekId,
  recipes: initialRecipes,
  embedded = false,
  weekStartDate,
  weekEndDate,
}: WeekRecipesListProps) {
  const [recipes, setRecipes] = useState(initialRecipes);
  const [isMounted, setIsMounted] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Sync local state with prop when parent refreshes
  useEffect(() => {
    setRecipes(initialRecipes);
  }, [initialRecipes]);

  // Generate weekdays based on startDate and endDate
  const weekdays = useMemo(() => {
    if (!weekStartDate || !weekEndDate) return [];

    try {
      const start = weekStartDate instanceof Date ? weekStartDate : parseISO(weekStartDate as unknown as string);
      const end = weekEndDate instanceof Date ? weekEndDate : parseISO(weekEndDate as unknown as string);

      return eachDayOfInterval({ start, end });
    } catch {
      return [];
    }
  }, [weekStartDate, weekEndDate]);

  // Group recipes by scheduled date
  const recipesByDate = useMemo(() => {
    const grouped = new Map<string, (WeekRecipe & { recipe: RecipeWithRelated })[]>();

    // Initialize all weekdays with empty arrays
    weekdays.forEach((date) => {
      grouped.set(format(date, 'yyyy-MM-dd'), []);
    });

    // Add "Unscheduled" category
    grouped.set('unscheduled', []);

    // Group recipes by their scheduled date
    recipes.forEach((weekRecipe) => {
      if (weekRecipe.scheduledDate) {
        const dateKey = format(new Date(weekRecipe.scheduledDate), 'yyyy-MM-dd');
        const existing = grouped.get(dateKey) || [];
        grouped.set(dateKey, [...existing, weekRecipe]);
      } else {
        const existing = grouped.get('unscheduled') || [];
        grouped.set('unscheduled', [...existing, weekRecipe]);
      }
    });

    return grouped;
  }, [recipes, weekdays]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { execute: reorderRecipes } = useServerAction(
    reorderWeekRecipesAction,
    {
      onError: ({ err }) => {
        toast.error(err.message || "Failed to reorder recipes");
        setRecipes(initialRecipes);
      },
    }
  );

  const { execute: removeRecipe } = useServerAction(
    removeRecipeFromWeekAction,
    {
      onSuccess: () => {
        toast.success("Recipe removed from week");
      },
      onError: ({ err }) => {
        toast.error(err.message || "Failed to remove recipe");
      },
    }
  );

  const { execute: toggleMade } = useServerAction(toggleWeekRecipeMadeAction, {
    onSuccess: () => {
      toast.success("Recipe status updated");
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to update recipe status");
    },
  });

  const { execute: updateScheduledDate } = useServerAction(updateWeekRecipeScheduledDateAction, {
    onSuccess: () => {
      toast.success("Recipe moved");
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to move recipe");
      // Revert on error - refresh to get server state
      router.refresh();
    },
  });

  const handleRemoveRecipe = async (recipeId: string) => {
    // Optimistically update UI
    setRecipes((prev) => prev.filter((r) => r.recipe.id !== recipeId));
    await removeRecipe({ weekId, recipeId });
  };

  const handleToggleMade = async (recipeId: string, currentMade: boolean) => {
    // Optimistically update UI
    setRecipes((prev) =>
      prev.map((r) =>
        r.recipe.id === recipeId ? { ...r, made: !currentMade } : r
      )
    );
    await toggleMade({ weekId, recipeId, made: !currentMade });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id as string | null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const activeRecipeId = active.id as string;
    const overContainerId = over.id as string;

    // Check if we're dropping on a date container, end zone, or another recipe
    const isDateContainer = overContainerId.startsWith('date-container-');
    const isEndZone = overContainerId.startsWith('end-zone-');

    if (isDateContainer || isEndZone) {
      // Dropped into a date section (container or end zone)
      const targetDateKey = isEndZone
        ? overContainerId.replace('end-zone-', '')
        : overContainerId.replace('date-container-', '');
      const activeRecipe = recipes.find(r => r.recipe.id === activeRecipeId);

      if (!activeRecipe) return;

      // Get current date key for active recipe
      const currentDateKey = activeRecipe.scheduledDate
        ? format(new Date(activeRecipe.scheduledDate), 'yyyy-MM-dd')
        : 'unscheduled';

      // Only update if moving to a different date
      if (currentDateKey !== targetDateKey) {
        const newDate = targetDateKey === 'unscheduled'
          ? null
          : weekdays.find(d => format(d, 'yyyy-MM-dd') === targetDateKey);

        // Get all recipes in target date to calculate new order
        const targetRecipes = recipes.filter(r => {
          const rDateKey = r.scheduledDate
            ? format(new Date(r.scheduledDate), 'yyyy-MM-dd')
            : 'unscheduled';
          return rDateKey === targetDateKey && r.recipe.id !== activeRecipeId;
        });

        // Optimistically update the UI - add to end of target date's list
        setRecipes((prev) => {
          const filtered = prev.filter(r => r.recipe.id !== activeRecipeId);
          const updated = { ...activeRecipe, scheduledDate: newDate || null };

          // Insert at the end of the target date group
          const result = [...filtered];
          const insertIndex = filtered.findIndex(r => {
            const rDateKey = r.scheduledDate
              ? format(new Date(r.scheduledDate), 'yyyy-MM-dd')
              : 'unscheduled';
            return rDateKey > targetDateKey || (rDateKey === 'unscheduled' && targetDateKey !== 'unscheduled');
          });

          if (insertIndex === -1) {
            result.push(updated);
          } else {
            result.splice(insertIndex, 0, updated);
          }

          return result;
        });

        // Update server
        updateScheduledDate({
          weekId,
          recipeId: activeRecipeId,
          scheduledDate: newDate || null,
        });
      }
    } else {
      // Dropped on another recipe - check if same date section
      const activeRecipe = recipes.find(r => r.recipe.id === activeRecipeId);
      const overRecipe = recipes.find(r => r.recipe.id === overContainerId);

      if (!activeRecipe || !overRecipe) return;

      const activeDateKey = activeRecipe.scheduledDate
        ? format(new Date(activeRecipe.scheduledDate), 'yyyy-MM-dd')
        : 'unscheduled';
      const overDateKey = overRecipe.scheduledDate
        ? format(new Date(overRecipe.scheduledDate), 'yyyy-MM-dd')
        : 'unscheduled';

      if (activeDateKey === overDateKey) {
        // Same section - reorder
        const oldIndex = recipes.findIndex((item) => item.recipe.id === active.id);
        const newIndex = recipes.findIndex((item) => item.recipe.id === over.id);

        const newOrder = arrayMove(recipes, oldIndex, newIndex);
        setRecipes(newOrder);

        reorderRecipes({
          weekId,
          recipeIds: newOrder.map((item) => item.recipe.id),
        });
      } else {
        // Different section - move to that date
        const newDate = overRecipe.scheduledDate || null;

        // Optimistically update the UI
        setRecipes((prev) =>
          prev.map((r) =>
            r.recipe.id === activeRecipeId
              ? { ...r, scheduledDate: newDate }
              : r
          )
        );

        // Update server
        updateScheduledDate({
          weekId,
          recipeId: activeRecipeId,
          scheduledDate: newDate,
        });
      }
    }
  };

  const handleRecipeAdded = () => {
    router.refresh();
  };

  // Helper to check if all recipes for a date are made
  const areAllRecipesMadeForDate = (dateKey: string) => {
    const dateRecipes = recipesByDate.get(dateKey) || [];
    return dateRecipes.length > 0 && dateRecipes.every((r) => r.made);
  };

  // Helper to toggle collapsed state for a date
  const toggleDateCollapsed = (dateKey: string) => {
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  // Get the active recipe being dragged
  const activeRecipe = activeId
    ? recipes.find((r) => r.recipe.id === activeId)
    : null;

  const content =
    recipes.length === 0 ? (
      <div className="p-6 text-center text-mystic-700 dark:text-cream-200">
        No recipes added to this week yet.
      </div>
    ) : !isMounted ? (
      // Show non-interactive list during SSR
      <div className="space-y-6">
        {weekdays.length > 0 ? (
          <>
            {/* Unscheduled recipes - at top */}
            {(recipesByDate.get('unscheduled') || []).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3 text-mystic-800 dark:text-cream-100">
                  Unscheduled ({recipesByDate.get('unscheduled')!.length})
                </h4>
                <div className="space-y-2">
                  {recipesByDate.get('unscheduled')!.map(({ recipe }) => {
                    const hasRelated = !!(recipe.relatedRecipes && recipe.relatedRecipes.length > 0);
                    return (
                      <StaticRecipeItem
                        key={recipe.id}
                        recipe={recipe}
                        hasRelated={hasRelated}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Weekday sections */}
            {weekdays.map((date) => {
              const dateKey = format(date, 'yyyy-MM-dd');
              const dateRecipes = recipesByDate.get(dateKey) || [];
              const allMade = areAllRecipesMadeForDate(dateKey);

              return (
                <div key={dateKey}>
                  {allMade ? (
                    // Minimized completed day (collapsed by default in SSR)
                    <div className="w-full flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg bg-mystic-50/50 dark:bg-cream-200/5 border border-mystic-200/50 dark:border-cream-200/10 text-mystic-600 dark:text-cream-300 mb-3">
                      <ChevronDown className="h-4 w-4" />
                      <span className="flex-1 text-left">{format(date, 'EEEE, MMM d')}</span>
                      <span className="text-xs opacity-60">{dateRecipes.length} completed ✓</span>
                    </div>
                  ) : (
                    // Regular active day
                    <>
                      <h4 className="text-sm font-semibold mb-3 text-mystic-800 dark:text-cream-100">
                        {format(date, 'EEEE, MMM d')} {dateRecipes.length > 0 && `(${dateRecipes.length})`}
                      </h4>
                      {dateRecipes.length > 0 ? (
                        <div className="space-y-2">
                          {dateRecipes.map(({ recipe }) => {
                            const hasRelated = !!(recipe.relatedRecipes && recipe.relatedRecipes.length > 0);
                            return (
                              <StaticRecipeItem
                                key={recipe.id}
                                recipe={recipe}
                                hasRelated={hasRelated}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-sm text-mystic-600 dark:text-cream-300 italic p-3">No recipes</div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </>
        ) : (
          // Fallback to flat list if no date range
          <div className="space-y-2">
            {recipes.map(({ recipe }) => {
              const hasRelated = !!(recipe.relatedRecipes && recipe.relatedRecipes.length > 0);
              return (
                <StaticRecipeItem
                  key={recipe.id}
                  recipe={recipe}
                  hasRelated={hasRelated}
                />
              );
            })}
          </div>
        )}
      </div>
    ) : (
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
          <div className="space-y-6">
            {weekdays.length > 0 ? (
              <>
                {/* Unscheduled recipes - at top */}
                {(recipesByDate.get('unscheduled') || []).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-3 text-mystic-800 dark:text-cream-100">
                      Unscheduled ({recipesByDate.get('unscheduled')!.length})
                    </h4>
                    <DroppableContainer id="date-container-unscheduled">
                      <SortableContext
                        items={recipesByDate.get('unscheduled')!.map((r) => r.recipe.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {recipesByDate.get('unscheduled')!.map((weekRecipe) => (
                            <SortableRecipeItem
                              key={weekRecipe.recipe.id}
                              weekRecipe={weekRecipe}
                              onRemove={handleRemoveRecipe}
                              onToggleMade={handleToggleMade}
                              isMade={weekRecipe.made}
                              isOver={overId === weekRecipe.recipe.id}
                            />
                          ))}
                        </div>
                        <EndDropZone id="end-zone-unscheduled" />
                      </SortableContext>
                    </DroppableContainer>
                  </div>
                )}

                {/* Weekday sections */}
                {weekdays.map((date) => {
                  const dateKey = format(date, 'yyyy-MM-dd');
                  const dateRecipes = recipesByDate.get(dateKey) || [];
                  const allMade = areAllRecipesMadeForDate(dateKey);
                  const isExpanded = collapsedDates.has(dateKey);

                  return (
                    <div key={dateKey}>
                      {allMade ? (
                        // Minimized completed day - clickable to expand
                        <DroppableContainer id={`date-container-${dateKey}`}>
                          <button
                            onClick={() => toggleDateCollapsed(dateKey)}
                            className="w-full flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg bg-mystic-50/50 dark:bg-cream-200/5 border border-mystic-200/50 dark:border-cream-200/10 text-mystic-600 dark:text-cream-300 hover:bg-mystic-100 dark:hover:bg-cream-200/10 transition-colors mb-3"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                            <span className="flex-1 text-left">{format(date, 'EEEE, MMM d')}</span>
                            <span className="text-xs opacity-60">{dateRecipes.length} completed ✓</span>
                          </button>
                          {isExpanded && (
                            <SortableContext
                              items={dateRecipes.map((r) => r.recipe.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              <div className="space-y-2 mb-3">
                                {dateRecipes.map((weekRecipe) => (
                                  <SortableRecipeItem
                                    key={weekRecipe.recipe.id}
                                    weekRecipe={weekRecipe}
                                    onRemove={handleRemoveRecipe}
                                    onToggleMade={handleToggleMade}
                                    isMade={weekRecipe.made}
                                    isOver={overId === weekRecipe.recipe.id}
                                  />
                                ))}
                              </div>
                              <EndDropZone id={`end-zone-${dateKey}`} />
                            </SortableContext>
                          )}
                        </DroppableContainer>
                      ) : (
                        // Regular active day
                        <>
                          <h4 className="text-sm font-semibold mb-3 text-mystic-800 dark:text-cream-100">
                            {format(date, 'EEEE, MMM d')} {dateRecipes.length > 0 && `(${dateRecipes.length})`}
                          </h4>
                          <DroppableContainer id={`date-container-${dateKey}`}>
                            <SortableContext
                              items={dateRecipes.map((r) => r.recipe.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {dateRecipes.length > 0 ? (
                                <>
                                  <div className="space-y-2">
                                    {dateRecipes.map((weekRecipe) => (
                                      <SortableRecipeItem
                                        key={weekRecipe.recipe.id}
                                        weekRecipe={weekRecipe}
                                        onRemove={handleRemoveRecipe}
                                        onToggleMade={handleToggleMade}
                                        isMade={weekRecipe.made}
                                        isOver={overId === weekRecipe.recipe.id}
                                      />
                                    ))}
                                  </div>
                                  <EndDropZone id={`end-zone-${dateKey}`} />
                                </>
                              ) : (
                                <div className="flex items-center justify-between p-3">
                                  <span className="text-sm text-mystic-600 dark:text-cream-300 italic">
                                    No recipes
                                  </span>
                                  <BrowseRecipesByTag
                                    weekId={weekId}
                                    scheduledDate={date}
                                    onRecipeAdded={handleRecipeAdded}
                                  />
                                </div>
                              )}
                            </SortableContext>
                          </DroppableContainer>
                        </>
                      )}
                    </div>
                  );
                })}
              </>
            ) : (
              // Fallback to flat list if no date range
              <SortableContext
                items={recipes.map((r) => r.recipe.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {recipes.map((weekRecipe) => (
                    <SortableRecipeItem
                      key={weekRecipe.recipe.id}
                      weekRecipe={weekRecipe}
                      onRemove={handleRemoveRecipe}
                      onToggleMade={handleToggleMade}
                      isMade={weekRecipe.made}
                      isOver={overId === weekRecipe.recipe.id}
                    />
                  ))}
                </div>
                <EndDropZone id="end-zone-fallback" />
              </SortableContext>
            )}
          </div>
        <DragOverlay>
          {activeRecipe ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-background border shadow-lg opacity-90">
              <div className="text-xl">{activeRecipe.recipe.emoji || "🍽️"}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate text-mystic-900 dark:text-cream-100">
                  {activeRecipe.recipe.name}
                </div>
              </div>
              {activeRecipe.recipe.mealType && (
                <Badge variant="secondary" className="text-xs">
                  {activeRecipe.recipe.mealType}
                </Badge>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    );

  if (embedded) {
    return (
      <>
        <div className="mt-4">{content}</div>
        <AddRecipeDialog
          weekId={weekId}
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          onRecipeAdded={handleRecipeAdded}
          weekStartDate={weekStartDate}
          weekEndDate={weekEndDate}
        />
      </>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Week Recipes
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2 dark:text-cream-200" />
              Add Recipe
            </Button>
          </div>
          {content}
        </CardContent>
      </Card>
      <AddRecipeDialog
        weekId={weekId}
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onRecipeAdded={handleRecipeAdded}
        weekStartDate={weekStartDate}
        weekEndDate={weekEndDate}
      />
    </>
  );
}

// Droppable container for date sections
function DroppableContainer({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[60px] transition-all duration-200 rounded-lg ${
        isOver
          ? 'bg-mystic-100/80 dark:bg-cream-200/15 ring-2 ring-mystic-500 dark:ring-cream-400 shadow-lg'
          : ''
      }`}
    >
      {children}
    </div>
  );
}

// End-of-list drop zone
function EndDropZone({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`transition-all duration-200 rounded-lg mt-1 ${
        isOver
          ? 'h-12 bg-mystic-100/80 dark:bg-cream-200/15 ring-2 ring-mystic-500 dark:ring-cream-400 shadow-lg border-2 border-dashed border-mystic-400 dark:border-cream-300'
          : 'h-8 hover:h-10 hover:bg-mystic-50/30 dark:hover:bg-cream-200/5 border border-dashed border-transparent hover:border-mystic-300/50 dark:hover:border-cream-300/20'
      }`}
    >
      {isOver && (
        <div className="flex items-center justify-center h-full text-xs text-mystic-600 dark:text-cream-300 font-medium">
          Drop to add at end
        </div>
      )}
    </div>
  );
}

const relationTypeLabels: Record<string, string> = {
  [RELATION_TYPES.SIDE]: "Side",
  [RELATION_TYPES.BASE]: "Base",
  [RELATION_TYPES.SAUCE]: "Sauce",
  [RELATION_TYPES.TOPPING]: "Topping",
  [RELATION_TYPES.DESSERT]: "Dessert",
  [RELATION_TYPES.CUSTOM]: "Related",
};

function StaticRecipeItem({
  recipe,
  hasRelated,
  isMade = false,
}: {
  recipe: RecipeWithRelated;
  hasRelated: boolean;
  isMade?: boolean;
}) {
  const [showRelated, setShowRelated] = useState(false);

  return (
    <div>
      <div className={`flex items-center gap-3 p-3 rounded-lg bg-background border hover:bg-mystic-50 dark:hover:bg-cream-200/10 transition-colors ${isMade ? 'opacity-60' : ''}`}>
        <div className="text-xl">{recipe.emoji || "🍽️"}</div>
        <div className="flex-1 min-w-0">
          <Link href={`/recipes/${recipe.id}`} className="block">
            <div className={`text-sm font-medium truncate text-mystic-900 dark:text-cream-100 hover:underline ${isMade ? 'line-through' : ''}`}>
              {recipe.name}
            </div>
          </Link>
          {hasRelated && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowRelated(!showRelated);
              }}
              className="text-xs text-mystic-600 dark:text-cream-100 hover:text-mystic-900 dark:hover:text-cream-50 flex items-center gap-1 mt-0.5"
            >
              {showRelated ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              {recipe.relatedRecipes!.length} related recipe{recipe.relatedRecipes!.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {recipe.mealType && (
            <Badge variant="secondary" className="text-xs">
              {recipe.mealType}
            </Badge>
          )}
          {recipe.difficulty && (
            <Badge variant="outline" className="text-xs">
              {recipe.difficulty}
            </Badge>
          )}
        </div>
      </div>
      {hasRelated && showRelated && (
        <div className="ml-12 mt-1 space-y-1">
          {recipe.relatedRecipes!.map((relatedRecipe) => (
            <Link
              key={relatedRecipe.id}
              href={`/recipes/${relatedRecipe.id}`}
              className="flex items-center gap-2 p-2 rounded-md bg-mystic-50/50 dark:bg-cream-200/5 border border-mystic-200/50 dark:border-cream-200/10 hover:bg-mystic-100 dark:hover:bg-cream-200/10 transition-colors"
            >
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                {relationTypeLabels[relatedRecipe.relationType] || "Related"}
              </Badge>
              <div className="text-sm opacity-60">{relatedRecipe.emoji || "🍽️"}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate text-mystic-800 dark:text-cream-100">
                  {relatedRecipe.name}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function SortableRecipeItem({
  weekRecipe,
  onRemove,
  onToggleMade,
  isMade = false,
  isOver = false,
}: {
  weekRecipe: WeekRecipe & { recipe: RecipeWithRelated };
  onRemove: (recipeId: string) => void;
  onToggleMade: (recipeId: string, currentMade: boolean) => void;
  isMade?: boolean;
  isOver?: boolean;
}) {
  const { recipe } = weekRecipe;
  const [showRelated, setShowRelated] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: recipe.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : isMade ? 0.6 : 1,
  };

  const hasRelatedRecipes = recipe.relatedRecipes && recipe.relatedRecipes.length > 0;

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Insertion indicator */}
      {isOver && (
        <div className="absolute -top-1 left-0 right-0 h-0.5 bg-mystic-500 dark:bg-cream-400 rounded-full shadow-lg z-10" />
      )}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-background border hover:bg-mystic-50 dark:hover:bg-cream-200/10 transition-colors group">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-5 w-5 text-mystic-600 dark:text-cream-200" />
        </div>
        <Checkbox
          checked={weekRecipe.made}
          onCheckedChange={() => onToggleMade(recipe.id, weekRecipe.made)}
          className="flex-shrink-0"
        />
        <div className="text-xl">{recipe.emoji || "🍽️"}</div>
        <div className="flex-1 min-w-0">
          <Link
            href={`/recipes/${recipe.id}`}
            className="block"
          >
            <div
              className={`text-sm font-medium truncate text-mystic-900 dark:text-cream-100 hover:underline ${
                isMade ? "line-through" : ""
              }`}
            >
              {recipe.name}
            </div>
          </Link>
          {hasRelatedRecipes && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowRelated(!showRelated);
              }}
              className="text-xs text-mystic-600 dark:text-cream-100 hover:text-mystic-900 dark:hover:text-cream-50 flex items-center gap-1 mt-0.5"
            >
              {showRelated ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              {recipe.relatedRecipes!.length} related recipe{recipe.relatedRecipes!.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {recipe.mealType && (
            <Badge variant="secondary" className="text-xs">
              {recipe.mealType}
            </Badge>
          )}
          {recipe.difficulty && (
            <Badge variant="outline" className="text-xs">
              {recipe.difficulty}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            onRemove(recipe.id);
          }}
          className="md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="h-4 w-4 dark:text-cream-300" />
        </Button>
      </div>

      {/* Related Recipes - collapsible nested below main recipe */}
      {hasRelatedRecipes && showRelated && (
        <div className="ml-12 mt-1 space-y-1">
          {recipe.relatedRecipes!.map((relatedRecipe) => (
            <Link
              key={relatedRecipe.id}
              href={`/recipes/${relatedRecipe.id}`}
              className="flex items-center gap-2 p-2 rounded-md bg-mystic-50/50 dark:bg-cream-200/5 border border-mystic-200/50 dark:border-cream-200/10 hover:bg-mystic-100 dark:hover:bg-cream-200/10 transition-colors group/related"
            >
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                {relationTypeLabels[relatedRecipe.relationType] || "Related"}
              </Badge>
              <div className="text-sm opacity-60">{relatedRecipe.emoji || "🍽️"}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate text-mystic-800 dark:text-cream-100">
                  {relatedRecipe.name}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
