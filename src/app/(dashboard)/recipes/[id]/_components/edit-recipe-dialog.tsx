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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pencil, X, Check, ChevronsUpDown } from "@/components/ui/themed-icons";
import {
  updateRecipeAction,
  getRecipeMetadataAction,
  createRecipeBookAction,
  getRecipesAction,
} from "../../recipes.actions";
import { getRecipeRelationsAction } from "../../recipe-relations.actions";
import { useServerAction } from "zsa-react";
import { useRouter } from "next/navigation";
import type { Recipe, RecipeBook } from "@/db/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  updateRecipeMetadataSchema,
  type UpdateRecipeMetadataSchema,
} from "@/schemas/recipe.schema";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  RelatedRecipesSelector,
  type RelatedRecipeItem,
} from "@/components/related-recipes-selector";

interface EditRecipeDialogProps {
  recipe: Recipe & {
    recipeBook?: RecipeBook | null;
  };
}

export function EditRecipeDialog({ recipe }: EditRecipeDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [metadata, setMetadata] = useState<{
    mealTypes: string[];
    difficulties: string[];
    tags: string[];
    recipeBooks: Array<{ id: string; name: string }>;
  } | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>(
    Array.isArray(recipe.tags) ? recipe.tags : []
  );
  const [tagInput, setTagInput] = useState("");
  const [showMealTypeInput, setShowMealTypeInput] = useState(false);
  const [showDifficultyInput, setShowDifficultyInput] = useState(false);
  const [showRecipeBookInput, setShowRecipeBookInput] = useState(false);
  const [newMealType, setNewMealType] = useState("");
  const [newDifficulty, setNewDifficulty] = useState("");
  const [newRecipeBook, setNewRecipeBook] = useState("");
  const [recipeBookOpen, setRecipeBookOpen] = useState(false);
  const [relatedRecipes, setRelatedRecipes] = useState<RelatedRecipeItem[]>([]);
  const [availableRecipes, setAvailableRecipes] = useState<
    Array<{ id: string; name: string; emoji: string | null }>
  >([]);

  const { execute, isPending } = useServerAction(updateRecipeAction, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
      toast.success("Recipe updated successfully!");
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to update recipe");
    },
  });

  const { execute: fetchMetadata } = useServerAction(getRecipeMetadataAction);
  const { execute: createRecipeBook } = useServerAction(createRecipeBookAction);
  const { execute: fetchRecipes } = useServerAction(getRecipesAction);
  const { execute: fetchRelations } = useServerAction(getRecipeRelationsAction);

  const form = useForm<UpdateRecipeMetadataSchema>({
    resolver: zodResolver(updateRecipeMetadataSchema),
    defaultValues: {
      id: recipe.id,
      name: recipe.name || "",
      emoji: recipe.emoji || "",
      mealType: recipe.mealType || "",
      difficulty: recipe.difficulty || "",
      visibility: (recipe.visibility ||
        undefined) as UpdateRecipeMetadataSchema["visibility"],
      // ingredients are handled by EditIngredientsDialog separately
      recipeBody: recipe.recipeBody || "",
      recipeLink: recipe.recipeLink || "",
      recipeBookId: recipe.recipeBookId || "",
      page: recipe.page || "",
    },
  });

  useEffect(() => {
    if (open) {
      async function loadData() {
        // Load metadata
        const [metadataData, metadataErr] = await fetchMetadata();
        if (!metadataErr && metadataData) {
          setMetadata(metadataData);
        }

        // Load all recipes for selector
        const [recipesData, recipesErr] = await fetchRecipes({ limit: 1000 });
        if (!recipesErr && recipesData) {
          setAvailableRecipes(
            recipesData.recipes.map((r) => ({
              id: r.id,
              name: r.name,
              emoji: r.emoji,
            }))
          );
        }

        // Load existing relations
        const [relationsData, relationsErr] = await fetchRelations({
          recipeId: recipe.id,
        });
        if (!relationsErr && relationsData && relationsData.relationsAsMain) {
          // Convert relationsAsMain to RelatedRecipeItem format
          const existingRelations: RelatedRecipeItem[] =
            relationsData.relationsAsMain.map((rel) => ({
              recipeId: rel.sideRecipeId,
              recipeTitle: rel.sideRecipe.name,
              recipeEmoji: rel.sideRecipe.emoji,
              relationType:
                rel.relationType as RelatedRecipeItem["relationType"],
            }));
          setRelatedRecipes(existingRelations);
        }
      }
      loadData();
    }
  }, [open, fetchMetadata, fetchRecipes, fetchRelations, recipe.id]);

  const handleAddTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !selectedTags.includes(trimmedTag)) {
      setSelectedTags([...selectedTags, trimmedTag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setSelectedTags(selectedTags.filter((t) => t !== tag));
  };

  const handleAddMealType = () => {
    if (newMealType.trim() && metadata && metadata.mealTypes) {
      form.setValue("mealType", newMealType.trim());
      setMetadata({
        ...metadata,
        mealTypes: [...metadata.mealTypes, newMealType.trim()].sort(),
      });
      setNewMealType("");
      setShowMealTypeInput(false);
    }
  };

  const handleAddDifficulty = () => {
    if (newDifficulty.trim() && metadata && metadata.difficulties) {
      form.setValue("difficulty", newDifficulty.trim());
      setMetadata({
        ...metadata,
        difficulties: [...metadata.difficulties, newDifficulty.trim()].sort(),
      });
      setNewDifficulty("");
      setShowDifficultyInput(false);
    }
  };

  const handleAddRecipeBook = async () => {
    if (newRecipeBook.trim() && metadata && metadata.recipeBooks) {
      const tempId = `rb_temp_${Date.now()}`;
      const newBook = { id: tempId, name: newRecipeBook.trim() };

      setMetadata({
        ...metadata,
        recipeBooks: [...metadata.recipeBooks, newBook].sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
      });
      form.setValue("recipeBookId", tempId);
      setNewRecipeBook("");
      setShowRecipeBookInput(false);

      toast.success("Recipe book added (will be created when you save)");
    }
  };

  async function onSubmit(values: UpdateRecipeMetadataSchema) {
    // Clean up the values: convert empty strings to null, keep undefined fields
    const cleanedValues: UpdateRecipeMetadataSchema = {
      id: values.id,
    };

    // Only include fields that are actually present
    if (values.name !== undefined) cleanedValues.name = values.name;
    if (values.emoji !== undefined)
      cleanedValues.emoji = values.emoji === "" ? null : values.emoji;
    if (values.mealType !== undefined)
      cleanedValues.mealType = values.mealType === "" ? null : values.mealType;
    if (values.difficulty !== undefined)
      cleanedValues.difficulty =
        values.difficulty === "" ? null : values.difficulty;
    if (values.visibility !== undefined)
      cleanedValues.visibility = values.visibility;
    if (values.recipeBody !== undefined)
      cleanedValues.recipeBody =
        values.recipeBody === "" ? null : values.recipeBody;
    if (values.recipeLink !== undefined)
      cleanedValues.recipeLink =
        values.recipeLink === "" ? null : values.recipeLink;
    if (values.recipeBookId !== undefined)
      cleanedValues.recipeBookId =
        values.recipeBookId === "" ? null : values.recipeBookId;
    if (values.page !== undefined)
      cleanedValues.page = values.page === "" ? null : values.page;

    const finalValues = {
      ...cleanedValues,
      tags: selectedTags.length > 0 ? selectedTags : null,
      relatedRecipes:
        relatedRecipes.length > 0
          ? relatedRecipes.map((r) => ({
              recipeId: r.recipeId,
              relationType: r.relationType,
            }))
          : null,
    };

    // If recipe book is a temp ID, create it first
    if (finalValues.recipeBookId?.startsWith("rb_temp_")) {
      const tempBook = metadata?.recipeBooks?.find(
        (book) => book.id === finalValues.recipeBookId
      );

      if (tempBook) {
        const [bookData, bookErr] = await createRecipeBook({
          name: tempBook.name,
        });

        if (bookErr) {
          toast.error("Failed to create recipe book");
          return;
        }

        finalValues.recipeBookId = bookData.recipeBook.id;
      }
    }

    await execute(finalValues);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Recipe</DialogTitle>
          <DialogDescription>
            Update recipe details, tags, and metadata
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipe Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Spaghetti Carbonara"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="emoji"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Emoji</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="🍝"
                      maxLength={10}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="mealType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meal Type</FormLabel>
                    {metadata ? (
                      <>
                        {!showMealTypeInput ? (
                          <>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value ?? undefined}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select meal type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {metadata.mealTypes?.map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {type}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mt-1 h-8 text-xs"
                              onClick={() => setShowMealTypeInput(true)}
                            >
                              + Add new meal type
                            </Button>
                          </>
                        ) : (
                          <div className="flex gap-2">
                            <Input
                              placeholder="e.g., Breakfast"
                              value={newMealType}
                              onChange={(e) => setNewMealType(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddMealType();
                                }
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleAddMealType}
                            >
                              Add
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setShowMealTypeInput(false);
                                setNewMealType("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <FormControl>
                        <Input
                          placeholder="Loading..."
                          disabled
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="difficulty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Difficulty</FormLabel>
                    {metadata ? (
                      <>
                        {!showDifficultyInput ? (
                          <>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value ?? undefined}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select difficulty" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {metadata.difficulties?.map((difficulty) => (
                                  <SelectItem
                                    key={difficulty}
                                    value={difficulty}
                                  >
                                    {difficulty}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mt-1 h-8 text-xs"
                              onClick={() => setShowDifficultyInput(true)}
                            >
                              + Add new difficulty
                            </Button>
                          </>
                        ) : (
                          <div className="flex gap-2">
                            <Input
                              placeholder="e.g., Moderate"
                              value={newDifficulty}
                              onChange={(e) => setNewDifficulty(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddDifficulty();
                                }
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleAddDifficulty}
                            >
                              Add
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setShowDifficultyInput(false);
                                setNewDifficulty("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <FormControl>
                        <Input
                          placeholder="Loading..."
                          disabled
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormItem>
              <FormLabel>Tags</FormLabel>
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedTags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex flex-col md:flex-row gap-2">
                {metadata &&
                  metadata.tags &&
                  metadata.tags.filter((tag) => !selectedTags.includes(tag))
                    .length > 0 && (
                    <Select
                      value={tagInput}
                      onValueChange={(value) => {
                        handleAddTag(value);
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select existing tag" />
                      </SelectTrigger>
                      <SelectContent>
                        {metadata.tags
                          .filter((tag) => !selectedTags.includes(tag))
                          .map((tag) => (
                            <SelectItem key={tag} value={tag}>
                              {tag}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                <Input
                  className="flex-1"
                  placeholder="Or type new tag"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag(tagInput);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddTag(tagInput)}
                  disabled={!tagInput.trim()}
                >
                  Add Tag
                </Button>
              </div>
              <FormDescription>
                Select from existing tags or type to create new ones
              </FormDescription>
            </FormItem>

            <FormField
              control={form.control}
              name="recipeLink"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipe Link</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://..."
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    URL to the original recipe online
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="recipeBookId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recipe Book</FormLabel>
                    {metadata ? (
                      <>
                        {!showRecipeBookInput ? (
                          <>
                            {metadata.recipeBooks &&
                            metadata.recipeBooks.length > 0 ? (
                              <Popover
                                open={recipeBookOpen}
                                onOpenChange={setRecipeBookOpen}
                              >
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      role="combobox"
                                      aria-expanded={recipeBookOpen}
                                      className={cn(
                                        "w-full justify-between font-normal",
                                        !field.value && "text-muted-foreground"
                                      )}
                                    >
                                      {field.value
                                        ? metadata.recipeBooks?.find(
                                            (book) => book.id === field.value
                                          )?.name
                                        : "Select recipe book"}
                                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[300px] p-0">
                                  <Command>
                                    <CommandInput placeholder="Search books..." />
                                    <CommandList>
                                      <CommandEmpty>
                                        No recipe book found.
                                      </CommandEmpty>
                                      <CommandGroup>
                                        {metadata.recipeBooks?.map((book) => (
                                          <CommandItem
                                            key={book.id}
                                            value={book.name}
                                            onSelect={() => {
                                              form.setValue(
                                                "recipeBookId",
                                                book.id
                                              );
                                              setRecipeBookOpen(false);
                                            }}
                                          >
                                            <Check
                                              className={cn(
                                                "mr-2 h-4 w-4",
                                                field.value === book.id
                                                  ? "opacity-100"
                                                  : "opacity-0"
                                              )}
                                            />
                                            {book.name}
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <FormControl>
                                <Input
                                  disabled
                                  placeholder="No recipe books available"
                                  {...field}
                                  value={field.value ?? ""}
                                />
                              </FormControl>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mt-1 h-8 text-xs"
                              onClick={() => setShowRecipeBookInput(true)}
                            >
                              + Add new recipe book
                            </Button>
                          </>
                        ) : (
                          <div className="flex gap-2">
                            <Input
                              placeholder="e.g., Joy of Cooking"
                              value={newRecipeBook}
                              onChange={(e) => setNewRecipeBook(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddRecipeBook();
                                }
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleAddRecipeBook}
                            >
                              Add
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setShowRecipeBookInput(false);
                                setNewRecipeBook("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <FormControl>
                        <Input
                          disabled
                          placeholder="Loading..."
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="page"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Page Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., 42"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormItem>
              <FormLabel>Related Recipes</FormLabel>
              <RelatedRecipesSelector
                currentRecipeId={recipe.id}
                selectedRecipes={relatedRecipes}
                availableRecipes={availableRecipes}
                onChange={setRelatedRecipes}
              />
              <FormDescription>
                Add side dishes, sauces, or other recipes that pair well with
                this one
              </FormDescription>
            </FormItem>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
