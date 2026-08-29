export const CHICKEN_RECIPE_SEARCH_EXAMPLE = `
const mealType: string = "Dinner";
const recipeSearchResponse = await external_recipeSearch({
  text: "chicken",
  mealTypes: [mealType],
  limit: 3
});
if (!recipeSearchResponse.ok) return recipeSearchResponse;
return recipeSearchResponse.data.items;
`;

export const CURRENT_SCHEDULE_EXAMPLE = `
const weekSearchResponse = await external_weekSearch({
  onDate: "2026-07-21",
  includeRecipes: true,
  limit: 5
});
if (!weekSearchResponse.ok) return weekSearchResponse;
return weekSearchResponse.data.items;
`;

export const TWO_RECIPE_COMPARISON_EXAMPLE = `
const recipeNames: Array<string> = [
  "Cilantro Lime Chicken Wings",
  "Paper-wrapped Chicken"
];
const searchResponses = await Promise.all(
  recipeNames.map((text) => external_recipeSearch({ text, limit: 10 }))
);
const failedSearch = searchResponses.find((response) => !response.ok);
if (failedSearch) return failedSearch;
const matches = searchResponses.map((response, index) => {
  if (!response.ok) return undefined;
  return response.data.items.find(
    (item) => item.name.toLowerCase() === recipeNames[index].toLowerCase()
  );
});
if (matches.some((match) => !match)) return { missingNames: recipeNames };
const recipeDetailsResponse = await external_recipeGetMany({
  ids: matches.map((match) => match.id),
  include: ["ingredients", "instructions", "history"]
});
if (!recipeDetailsResponse.ok) return recipeDetailsResponse;
return recipeDetailsResponse.data;
`;

export const CODE_MODE_ACCEPTANCE_EXAMPLES = {
  chickenSearch: CHICKEN_RECIPE_SEARCH_EXAMPLE,
  currentSchedule: CURRENT_SCHEDULE_EXAMPLE,
  twoRecipeComparison: TWO_RECIPE_COMPARISON_EXAMPLE,
} as const;
