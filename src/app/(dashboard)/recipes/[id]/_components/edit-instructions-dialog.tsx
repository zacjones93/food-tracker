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
import { Pencil, Plus } from "@/components/ui/themed-icons";
import { updateRecipeAction } from "../../recipes.actions";
import { useServerAction } from "zsa-react";
import { useRouter } from "next/navigation";
import type { Recipe } from "@/db/schema";

interface EditInstructionsDialogProps {
  recipe: Recipe;
}

export function EditInstructionsDialog({ recipe }: EditInstructionsDialogProps) {
  const [open, setOpen] = useState(false);
  const [instructionsText, setInstructionsText] = useState(recipe.recipeBody || "");
  const router = useRouter();

  const { execute, isPending } = useServerAction(updateRecipeAction, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });

  const handleSave = async () => {
    await execute({
      id: recipe.id,
      recipeBody: instructionsText.trim() || null,
    });
  };

  const hasInstructions = recipe.recipeBody && recipe.recipeBody.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {hasInstructions ? (
          <Button variant="ghost" size="sm">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Create Instructions
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Instructions</DialogTitle>
          <DialogDescription>
            Write your recipe instructions. Markdown formatting is supported.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Textarea
            value={instructionsText}
            onChange={(e) => setInstructionsText(e.target.value)}
            placeholder="1. Preheat oven to 350°F&#10;2. Mix dry ingredients...&#10;&#10;You can use **bold** and *italic* text."
            className="min-h-[400px] font-mono"
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
