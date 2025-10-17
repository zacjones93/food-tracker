"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Recipe } from "@/db/schema";
import { format } from "date-fns";

interface RecipesTableProps {
  recipes: Recipe[];
}

export function RecipesTable({ recipes }: RecipesTableProps) {
  if (recipes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          No recipes yet
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Create your first recipe to get started
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Meal Type</TableHead>
            <TableHead>Difficulty</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Meals Eaten</TableHead>
            <TableHead>Last Made</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recipes.map((recipe) => (
            <TableRow key={recipe.id} className="cursor-pointer hover:bg-muted/50">
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {recipe.emoji && (
                    <span className="text-xl">{recipe.emoji}</span>
                  )}
                  <span>{recipe.name}</span>
                </div>
              </TableCell>
              <TableCell>
                {recipe.mealType && (
                  <Badge variant="outline">{recipe.mealType}</Badge>
                )}
              </TableCell>
              <TableCell>
                {recipe.difficulty && (
                  <Badge
                    variant={
                      recipe.difficulty === "Easy"
                        ? "default"
                        : recipe.difficulty === "Medium"
                        ? "secondary"
                        : "destructive"
                    }
                  >
                    {recipe.difficulty}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {recipe.tags && recipe.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {recipe.tags.map((tag, i) => (
                      <Badge key={i} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell>{recipe.mealsEatenCount}</TableCell>
              <TableCell className="text-muted-foreground">
                {recipe.lastMadeDate
                  ? format(new Date(recipe.lastMadeDate), "MMM d, yyyy")
                  : "Never"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
