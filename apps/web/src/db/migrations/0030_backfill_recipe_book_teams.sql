UPDATE recipe_books
SET teamId = (
  SELECT recipes.teamId
  FROM recipes
  WHERE recipes.recipeBookId = recipe_books.id
  GROUP BY recipes.teamId
  ORDER BY COUNT(*) DESC, recipes.teamId
  LIMIT 1
)
WHERE teamId IS NULL
  AND EXISTS (
    SELECT 1
    FROM recipes
    WHERE recipes.recipeBookId = recipe_books.id
  );
--> statement-breakpoint
UPDATE recipe_books
SET teamId = (SELECT id FROM team ORDER BY createdAt LIMIT 1)
WHERE teamId IS NULL
  AND (SELECT COUNT(*) FROM team) = 1;
