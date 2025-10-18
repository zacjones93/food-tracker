"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Plus } from "lucide-react";
import { updateRecipeAction } from "../../recipes.actions";
import { useServerAction } from "zsa-react";
import { useRouter } from "next/navigation";
import type { Recipe } from "@/db/schema";

interface EditIngredientsDialogProps {
  recipe: Recipe;
}

export function EditIngredientsDialog({ recipe }: EditIngredientsDialogProps) {
  const [open, setOpen] = useState(false);
  const [ingredientsText, setIngredientsText] = useState(
    recipe.ingredients?.join("\n") || ""
  );
  const router = useRouter();

  const { execute, isPending } = useServerAction(updateRecipeAction, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });

  const handleSave = async () => {
    const ingredientsArray = ingredientsText
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);

    await execute({
      id: recipe.id,
      ingredients: ingredientsArray.length > 0 ? ingredientsArray : null,
    });
  };

  const hasIngredients = recipe.ingredients && recipe.ingredients.length > 0;

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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Ingredients</DialogTitle>
          <DialogDescription>
            Enter each ingredient on a new line.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Textarea
            value={ingredientsText}
            onChange={(e) => setIngredientsText(e.target.value)}
            placeholder="1 cup flour&#10;2 eggs&#10;1/2 cup milk"
            className="min-h-[300px] font-mono"
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
