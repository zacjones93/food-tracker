"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil, Plus } from "@/components/ui/themed-icons";
import { updateRecipeAction } from "../../recipes.actions";
import { useServerAction } from "zsa-react";
import { useRouter } from "next/navigation";
import type { Recipe } from "@/db/schema";
import {
  SortableIngredientSections,
  type IngredientSection,
} from "./sortable-ingredient-sections";

interface EditIngredientsDialogProps {
  recipe: Recipe;
}

// Helper to normalize ingredients for backward compatibility
function normalizeIngredients(
  ingredients: unknown
): Array<{ title?: string; items: string[] }> | null {
  if (!ingredients || !Array.isArray(ingredients)) return null;
  if (ingredients.length === 0) return null;

  // If it's already in the new format
  if (
    typeof ingredients[0] === "object" &&
    ingredients[0] !== null &&
    "items" in ingredients[0]
  ) {
    // Ensure all sections have valid items arrays
    return ingredients
      .filter(
        (section): section is { title?: string; items: unknown } =>
          section !== null && typeof section === "object" && "items" in section
      )
      .map((section) => ({
        title: section.title,
        items: Array.isArray(section.items)
          ? section.items.filter(
              (item): item is string => typeof item === "string"
            )
          : [],
      }))
      .filter((section) => section.items.length > 0);
  }

  // If it's in the old format (array of strings), convert it
  if (ingredients.every((i) => typeof i === "string")) {
    return [{ title: undefined, items: ingredients as string[] }];
  }

  return null;
}

// Convert sections to include IDs for sorting
function sectionsWithIds(
  sections: Array<{ title?: string; items: string[] }> | null
): IngredientSection[] {
  if (!sections) {
    return [
      {
        id: `section-${Date.now()}`,
        items: [],
      },
    ];
  }

  return sections.map((section, index) => ({
    id: `section-${index}`,
    title: section.title,
    items: section.items,
  }));
}

export function EditIngredientsDialog({ recipe }: EditIngredientsDialogProps) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<IngredientSection[]>(() =>
    sectionsWithIds(normalizeIngredients(recipe.ingredients))
  );
  const router = useRouter();

  // Reset sections when dialog opens
  useEffect(() => {
    if (open) {
      setSections(sectionsWithIds(normalizeIngredients(recipe.ingredients)));
    }
  }, [open, recipe.ingredients]);

  const { execute, isPending } = useServerAction(updateRecipeAction, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });

  const handleSave = async () => {
    // Filter out sections with no items and remove IDs
    const sectionsToSave = sections
      .filter((section) => section.items.length > 0)
      .map(({ title, items }) => ({
        title: title || undefined,
        items,
      }));

    await execute({
      id: recipe.id,
      ingredients: sectionsToSave.length > 0 ? sectionsToSave : null,
    });
  };

  const hasIngredients =
    Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {hasIngredients ? (
          <Button variant="ghost" size="sm">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Create Ingredients
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Ingredients</DialogTitle>
          <DialogDescription>
            Organize ingredients into sections. Drag sections to reorder them.
            Section titles are optional (e.g., &quot;Main Dish&quot;,
            &quot;Sauce&quot;).
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto py-4 pr-2">
          <SortableIngredientSections
            sections={sections}
            onChange={setSections}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
