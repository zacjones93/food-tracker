"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, ChevronsUpDown, GripVertical } from "@/components/ui/themed-icons";
import { cn } from "@/lib/utils";
import { RELATION_TYPES, type RelationType } from "@/schemas/recipe-relation.schema";
import type { Recipe } from "@/db/schema";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type RelatedRecipeItem = {
  recipeId: string;
  recipeTitle: string;
  recipeEmoji?: string | null;
  relationType: RelationType;
  scheduleLeadDays?: number | null;
};

type RelatedRecipesSelectorProps = {
  currentRecipeId?: string;
  selectedRecipes: RelatedRecipeItem[];
  availableRecipes: Pick<Recipe, "id" | "name" | "emoji">[];
  onChange: (recipes: RelatedRecipeItem[]) => void;
};

const relationTypeLabels: Record<RelationType, string> = {
  [RELATION_TYPES.SIDE]: "Side",
  [RELATION_TYPES.BASE]: "Base",
  [RELATION_TYPES.SAUCE]: "Sauce",
  [RELATION_TYPES.TOPPING]: "Topping",
  [RELATION_TYPES.DESSERT]: "Dessert",
  [RELATION_TYPES.CUSTOM]: "Custom",
};

function SortableRelatedRecipe({
  item,
  onRemove,
  onTypeChange,
  onScheduleChange,
}: {
  item: RelatedRecipeItem;
  onRemove: () => void;
  onTypeChange: (type: RelationType) => void;
  onScheduleChange: (scheduleLeadDays: number | null) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.recipeId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start gap-2 rounded-md border bg-background p-3",
        isDragging && "opacity-50"
      )}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{item.recipeEmoji || "🍽️"}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {item.recipeTitle}
          </span>
          <Select value={item.relationType} onValueChange={onTypeChange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(relationTypeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label={`Remove ${item.recipeTitle}`}
          >
            <X className="h-4 w-4 text-cream-100" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/50 px-3 py-2">
          <Switch
            checked={item.scheduleLeadDays != null}
            onCheckedChange={(checked) => onScheduleChange(checked ? 1 : null)}
            aria-label={`Suggest scheduling ${item.recipeTitle} separately`}
          />
          <span className="text-sm text-muted-foreground">
            Suggest scheduling separately
          </span>
          {item.scheduleLeadDays != null ? (
            <label className="ml-auto flex items-center gap-2 text-sm">
              <Input
                type="number"
                min={0}
                max={365}
                value={item.scheduleLeadDays}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10);
                  onScheduleChange(Number.isNaN(value) ? 0 : Math.min(365, Math.max(0, value)));
                }}
                className="h-8 w-20"
                aria-label={`Days before ${item.recipeTitle}`}
              />
              day{item.scheduleLeadDays === 1 ? "" : "s"} before
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function RelatedRecipesSelector({
  currentRecipeId,
  selectedRecipes,
  availableRecipes,
  onChange,
}: RelatedRecipesSelectorProps) {
  const [open, setOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Filter out current recipe and already selected recipes
  const filteredRecipes = availableRecipes.filter(
    (recipe) =>
      recipe.id !== currentRecipeId &&
      !selectedRecipes.find((r) => r.recipeId === recipe.id)
  );

  const handleAddRecipe = (recipe: Pick<Recipe, "id" | "name" | "emoji">) => {
    const newItem: RelatedRecipeItem = {
      recipeId: recipe.id,
      recipeTitle: recipe.name,
      recipeEmoji: recipe.emoji,
      relationType: RELATION_TYPES.SIDE,
      scheduleLeadDays: null,
    };
    onChange([...selectedRecipes, newItem]);
    setOpen(false);
  };

  const handleRemoveRecipe = (recipeId: string) => {
    onChange(selectedRecipes.filter((r) => r.recipeId !== recipeId));
  };

  const handleTypeChange = (recipeId: string, type: RelationType) => {
    onChange(
      selectedRecipes.map((r) =>
        r.recipeId === recipeId ? { ...r, relationType: type } : r
      )
    );
  };

  const handleScheduleChange = (recipeId: string, scheduleLeadDays: number | null) => {
    onChange(
      selectedRecipes.map((recipe) =>
        recipe.recipeId === recipeId ? { ...recipe, scheduleLeadDays } : recipe
      )
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = selectedRecipes.findIndex((r) => r.recipeId === active.id);
      const newIndex = selectedRecipes.findIndex((r) => r.recipeId === over.id);
      onChange(arrayMove(selectedRecipes, oldIndex, newIndex));
    }
  };

  return (
    <div className="space-y-3">
      {selectedRecipes.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={selectedRecipes.map((r) => r.recipeId)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {selectedRecipes.map((item) => (
                <SortableRelatedRecipe
                  key={item.recipeId}
                  item={item}
                  onRemove={() => handleRemoveRecipe(item.recipeId)}
                  onTypeChange={(type) => handleTypeChange(item.recipeId, type)}
                  onScheduleChange={(scheduleLeadDays) =>
                    handleScheduleChange(item.recipeId, scheduleLeadDays)
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {selectedRecipes.length > 0
              ? `${selectedRecipes.length} related recipe${selectedRecipes.length === 1 ? "" : "s"}`
              : "Add related recipes"}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 text-cream-100" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search recipes..." />
            <CommandList className="max-h-[300px] overflow-y-auto">
              <CommandEmpty>No recipes found.</CommandEmpty>
              <CommandGroup>
                {filteredRecipes.map((recipe) => (
                  <CommandItem
                    key={recipe.id}
                    value={recipe.name}
                    onSelect={() => handleAddRecipe(recipe)}
                  >
                    <span className="mr-2">{recipe.emoji || "🍽️"}</span>
                    {recipe.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
