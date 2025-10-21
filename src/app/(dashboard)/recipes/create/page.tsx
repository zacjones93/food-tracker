"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createRecipeSchema,
  type CreateRecipeSchema,
} from "@/schemas/recipe.schema";
import {
  createRecipeAction,
  getRecipeMetadataAction,
  createRecipeBookAction,
} from "../recipes.actions";
import { useServerAction } from "zsa-react";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Loader2,
  X,
  Check,
  ChevronsUpDown,
} from "@/components/ui/themed-icons";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  SortableIngredientSections,
  type IngredientSection,
} from "../[id]/_components/sortable-ingredient-sections";

export default function CreateRecipePage() {
  const router = useRouter();
  const [ingredientSections, setIngredientSections] = useState<
    IngredientSection[]
  >([
    {
      id: `section-${Date.now()}`,
      items: [],
    },
  ]);
  const [metadata, setMetadata] = useState<{
    mealTypes: string[];
    difficulties: string[];
    tags: string[];
    recipeBooks: Array<{ id: string; name: string }>;
  } | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showMealTypeInput, setShowMealTypeInput] = useState(false);
  const [showDifficultyInput, setShowDifficultyInput] = useState(false);
  const [showRecipeBookInput, setShowRecipeBookInput] = useState(false);
  const [newMealType, setNewMealType] = useState("");
  const [newDifficulty, setNewDifficulty] = useState("");
  const [newRecipeBook, setNewRecipeBook] = useState("");
  const [recipeBookOpen, setRecipeBookOpen] = useState(false);

  const { execute, isPending } = useServerAction(createRecipeAction);
  const { execute: fetchMetadata } = useServerAction(getRecipeMetadataAction);
  const { execute: createRecipeBook } = useServerAction(createRecipeBookAction);

  const form = useForm<CreateRecipeSchema>({
    resolver: zodResolver(createRecipeSchema),
    defaultValues: {
      name: "",
      emoji: "",
      tags: [],
      mealType: "",
      difficulty: "",
      ingredients: [],
      recipeBody: "",
      recipeLink: "",
      recipeBookId: "",
      page: "",
    },
  });

  useEffect(() => {
    async function loadMetadata() {
      const [data, err] = await fetchMetadata();
      if (!err && data) {
        setMetadata(data);
      }
    }
    loadMetadata();
  }, [fetchMetadata]);

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
    if (newMealType.trim() && metadata) {
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
    if (newDifficulty.trim() && metadata) {
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
    if (newRecipeBook.trim() && metadata) {
      // For now, just add to local state - we'd need a server action to persist
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

      toast.success(
        "Recipe book added (will be created when you save the recipe)"
      );
    }
  };

  async function onSubmit(values: CreateRecipeSchema) {
    // Filter out sections with no items and remove IDs
    const sectionsToSave = ingredientSections
      .filter((section) => section.items.length > 0)
      .map(({ title, items }) => ({
        title: title || undefined,
        items,
      }));

    const finalValues = {
      ...values,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      ingredients: sectionsToSave.length > 0 ? sectionsToSave : undefined,
    };

    // If recipe book is a temp ID, create it first
    if (finalValues.recipeBookId?.startsWith("rb_temp_")) {
      const tempBook = metadata?.recipeBooks.find(
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

        // Use the real recipe book ID
        finalValues.recipeBookId = bookData.recipeBook.id;
      }
    }

    const [data, err] = await execute(finalValues);

    if (err) {
      toast.error(err.message || "Failed to create recipe");
      return;
    }

    toast.success("Recipe created successfully!");
    router.push(`/recipes/${data.recipe.id}`);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Recipe</h1>
          <p className="text-muted-foreground">
            Add a new recipe to your collection
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/recipes">
            <ArrowLeft className="h-4 w-4 mr-2 text-cream-100" />
            Back to Recipes
          </Link>
        </Button>
      </div>

      <div className="max-w-2xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipe Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Spaghetti Carbonara" {...field} />
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
                    <Input placeholder="🍝" maxLength={10} {...field} />
                  </FormControl>
                  <FormDescription>
                    Add an emoji to make your recipe easier to identify
                  </FormDescription>
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
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select meal type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {metadata.mealTypes.map((type) => (
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
                        <Input placeholder="e.g., Dinner, Lunch" {...field} />
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
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select difficulty" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {metadata.difficulties.map((difficulty) => (
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
                          placeholder="e.g., Easy, Medium, Hard"
                          {...field}
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
                        <X className="h-3 w-3 text-cream-100" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex flex-col md:flex-row gap-2">
                {metadata &&
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
                    <Input placeholder="https://..." {...field} />
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
                            {metadata.recipeBooks.length > 0 ? (
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
                                        ? metadata.recipeBooks.find(
                                            (book) => book.id === field.value
                                          )?.name
                                        : "Select recipe book"}
                                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 text-cream-100" />
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
                                        {metadata.recipeBooks.map((book) => (
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
                        <Input disabled placeholder="Loading..." {...field} />
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
                      <Input placeholder="e.g., 42" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormItem>
              <FormLabel>Ingredients</FormLabel>
              <SortableIngredientSections
                sections={ingredientSections}
                onChange={setIngredientSections}
              />
              <FormDescription>
                Organize ingredients into sections. Section titles are optional
                (e.g., &quot;Main Dish&quot;, &quot;Sauce&quot;).
              </FormDescription>
            </FormItem>

            <FormField
              control={form.control}
              name="recipeBody"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Instructions</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter cooking instructions..."
                      rows={10}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Full recipe instructions and notes (supports markdown)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3">
              <Button type="submit" disabled={isPending}>
                {isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-cream-100" />
                )}
                Create Recipe
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/recipes")}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
