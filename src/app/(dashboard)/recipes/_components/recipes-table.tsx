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
import { Button } from "@/components/ui/button";
import type { Recipe } from "@/db/schema";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryState, parseAsInteger } from "nuqs";
import Link from "next/link";
import { AddToSchedule } from "./add-to-schedule";

interface RecipeWithWeekInfo extends Recipe {
  latestWeekId: string | null;
  latestWeekName: string | null;
}

interface RecipesTableProps {
  recipes: RecipeWithWeekInfo[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function RecipesTable({ recipes, pagination }: RecipesTableProps) {
  const router = useRouter();
  const [, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

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
    <div className="space-y-4">
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
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recipes.map((recipe) => (
            <TableRow key={recipe.id}>
              <TableCell
                className="font-medium cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/recipes/${recipe.id}`)}
              >
                <div className="flex items-center gap-2">
                  {recipe.emoji && (
                    <span className="text-xl">{recipe.emoji}</span>
                  )}
                  <span>{recipe.name}</span>
                </div>
              </TableCell>
              <TableCell
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/recipes/${recipe.id}`)}
              >
                {recipe.mealType && (
                  <Badge variant="outline">{recipe.mealType}</Badge>
                )}
              </TableCell>
              <TableCell
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/recipes/${recipe.id}`)}
              >
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
              <TableCell
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/recipes/${recipe.id}`)}
              >
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
              <TableCell
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/recipes/${recipe.id}`)}
              >
                {recipe.mealsEatenCount}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {recipe.latestWeekId && recipe.latestWeekName ? (
                  <Link href={`/schedule/${recipe.latestWeekId}`}>
                    <Button variant="ghost" size="sm" className="h-8 gap-2">
                      <span>{recipe.latestWeekName}</span>
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                ) : (
                  "Never"
                )}
              </TableCell>
              <TableCell className="text-right">
                <AddToSchedule recipeId={recipe.id} showLabel={false} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{" "}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
            {pagination.total} recipes
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(1).then(() => router.refresh())}
              disabled={pagination.page === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(pagination.page - 1).then(() => router.refresh())}
              disabled={pagination.page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium">
              Page {pagination.page} of {pagination.totalPages}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(pagination.page + 1).then(() => router.refresh())}
              disabled={pagination.page === pagination.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(pagination.totalPages).then(() => router.refresh())}
              disabled={pagination.page === pagination.totalPages}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
