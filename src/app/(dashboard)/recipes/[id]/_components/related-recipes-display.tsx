"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Recipe, RecipeRelation } from "@/db/schema";
import { RELATION_TYPES } from "@/schemas/recipe-relation.schema";

const relationTypeLabels: Record<string, string> = {
  [RELATION_TYPES.SIDE]: "Side",
  [RELATION_TYPES.BASE]: "Base",
  [RELATION_TYPES.SAUCE]: "Sauce",
  [RELATION_TYPES.TOPPING]: "Topping",
  [RELATION_TYPES.DESSERT]: "Dessert",
  [RELATION_TYPES.CUSTOM]: "Related",
};

interface RelatedRecipesDisplayProps {
  relationsAsMain?: Array<RecipeRelation & { sideRecipe: Recipe }>;
  relationsAsSide?: Array<RecipeRelation & { mainRecipe: Recipe }>;
}

export function RelatedRecipesDisplay({
  relationsAsMain = [],
  relationsAsSide = [],
}: RelatedRecipesDisplayProps) {
  const hasRelations = relationsAsMain.length > 0 || relationsAsSide.length > 0;

  if (!hasRelations) {
    return null;
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold mb-4">Related Recipes</h2>

      {relationsAsMain.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Pairs well with
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {relationsAsMain.map((relation) => (
              <Link
                key={relation.id}
                href={`/recipes/${relation.sideRecipeId}`}
                className="group"
              >
                <Card className="p-4 hover:bg-accent transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">
                      {relation.sideRecipe.emoji || "🍽️"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate group-hover:text-primary">
                        {relation.sideRecipe.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {relationTypeLabels[relation.relationType] ||
                            "Related"}
                        </Badge>
                        {relation.sideRecipe.mealType && (
                          <span className="text-xs text-muted-foreground">
                            {relation.sideRecipe.mealType}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {relationsAsSide.length > 0 && (
        <div className={`space-y-3 ${relationsAsMain.length > 0 ? "mt-6" : ""}`}>
          <h3 className="text-sm font-medium text-muted-foreground">
            Goes well with
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {relationsAsSide.map((relation) => (
              <Link
                key={relation.id}
                href={`/recipes/${relation.mainRecipeId}`}
                className="group"
              >
                <Card className="p-4 hover:bg-accent transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">
                      {relation.mainRecipe.emoji || "🍽️"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate group-hover:text-primary">
                        {relation.mainRecipe.name}
                      </p>
                      {relation.mainRecipe.mealType && (
                        <span className="text-xs text-muted-foreground mt-1 block">
                          {relation.mainRecipe.mealType}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
