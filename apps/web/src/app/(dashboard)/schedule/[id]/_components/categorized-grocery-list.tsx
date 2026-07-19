"use client";

import { useState, useRef, useEffect } from "react";
import { type GroceryItem } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  ArrowRightLeft,
  MoreVertical,
} from "@/components/ui/themed-icons";
import { useServerAction } from "zsa-react";
import {
  createGroceryItemAction,
  deleteGroceryItemAction,
  toggleGroceryItemAction,
  updateGroceryItemAction,
  bulkUpdateGroceryItemsAction,
} from "../../grocery-items.actions";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TransferItemsDialog } from "./transfer-items-dialog";

interface CategorizedGroceryListProps {
  weekId: string;
  items: GroceryItem[];
}

interface SortableItemProps {
  item: GroceryItem;
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (item: GroceryItem) => void;
  onTransfer: (item: GroceryItem) => void;
  editingId: string | null;
  editValue: string;
  setEditValue: (value: string) => void;
  saveEdit: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function SortableItem({
  item,
  onToggle,
  onDelete,
  onEdit,
  onTransfer,
  editingId,
  editValue,
  setEditValue,
  saveEdit,
  handleKeyDown,
  inputRef,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground dark:text-cream-300" />
      </div>

      <Checkbox
        checked={item.checked}
        onCheckedChange={(checked) => onToggle(item.id, checked as boolean)}
      />

      {editingId === item.id ? (
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={handleKeyDown}
          className="flex-1 h-8"
        />
      ) : (
        <span
          onClick={() => onEdit(item)}
          className={`flex-1 cursor-pointer ${
            item.checked ? "line-through text-muted-foreground" : ""
          }`}
        >
          {item.name}
        </span>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onTransfer(item)}
        title="Transfer item to another week"
      >
        <ArrowRightLeft className="h-4 w-4 dark:text-cream-300" />
      </Button>

      <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)}>
        <Trash2 className="h-4 w-4 dark:text-cream-300" />
      </Button>
    </div>
  );
}

interface SortableCategoryProps {
  category: string;
  categoryItems: GroceryItem[];
  isEmpty: boolean;
  isCollapsed: boolean;
  isManuallyCollapsed: boolean;
  onToggleCollapse: (category: string) => void;
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  onDeleteEmptyCategory: (category: string) => void;
  onEdit: (item: GroceryItem) => void;
  onTransfer: (item: GroceryItem) => void;
  onTransferCategory: (category: string, mode: "all" | "unchecked") => void;
  editingId: string | null;
  editValue: string;
  setEditValue: (value: string) => void;
  saveEdit: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  addingToCategory: string | null;
  addItemValue: string;
  setAddItemValue: (value: string) => void;
  startAddingToCategory: (category: string) => void;
  saveAddItem: (category: string) => void;
  handleAddKeyDown: (e: React.KeyboardEvent, category: string) => void;
  addItemInputRef: React.RefObject<HTMLInputElement | null>;
}

function SortableCategory({
  category,
  categoryItems,
  isEmpty,
  isCollapsed,
  isManuallyCollapsed,
  onToggleCollapse,
  onToggle,
  onDelete,
  onDeleteEmptyCategory,
  onEdit,
  onTransfer,
  onTransferCategory,
  editingId,
  editValue,
  setEditValue,
  saveEdit,
  handleKeyDown,
  inputRef,
  addingToCategory,
  addItemValue,
  setAddItemValue,
  startAddingToCategory,
  saveAddItem,
  handleAddKeyDown,
  addItemInputRef,
}: SortableCategoryProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `category-${category}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Determine if category should show collapsed content
  const shouldShowCollapsed = isCollapsed || isManuallyCollapsed;
  const checkedCount = categoryItems.filter((item) => item.checked).length;

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground dark:text-cream-300" />
          </div>
          {!isEmpty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleCollapse(category)}
              className="h-6 w-6 p-0"
            >
              {isManuallyCollapsed ? (
                <ChevronRight className="h-4 w-4 dark:text-cream-300" />
              ) : (
                <ChevronDown className="h-4 w-4 dark:text-cream-300" />
              )}
            </Button>
          )}
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            {category}
          </h3>
          {!isEmpty && (
            <span className="text-xs text-muted-foreground/70">
              ({categoryItems.length} items
              {checkedCount > 0 ? `, ${checkedCount} checked` : ""})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => startAddingToCategory(category)}
            className="h-6 w-6 p-0"
          >
            <Plus className="h-4 w-4 dark:text-cream-300" />
          </Button>
          {isEmpty ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDeleteEmptyCategory(category)}
            >
              <Trash2 className="h-4 w-4 dark:text-cream-300" />
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <MoreVertical className="h-4 w-4 dark:text-cream-300" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onTransferCategory(category, "all")}>
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  Transfer all items
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onTransferCategory(category, "unchecked")}
                  disabled={categoryItems.every((item) => item.checked)}
                >
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  Transfer unchecked items
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {addingToCategory === category && (
        <div className="flex gap-2 mb-2 mt-2">
          <Input
            ref={addItemInputRef}
            value={addItemValue}
            onChange={(e) => setAddItemValue(e.target.value)}
            onBlur={() => saveAddItem(category)}
            onKeyDown={(e) => handleAddKeyDown(e, category)}
            placeholder="Add item to category..."
            className="h-8"
          />
        </div>
      )}
      {isEmpty ? (
        <div className="text-sm text-muted-foreground italic py-2 px-3 border border-dashed rounded-lg">
          Empty category - add items above
        </div>
      ) : shouldShowCollapsed ? (
        <div className="text-sm text-muted-foreground/50 italic py-2 px-3 border border-dashed rounded-lg">
          {categoryItems.length} items
          {checkedCount > 0 ? ` (${checkedCount} checked)` : ""}
          {isCollapsed && !isManuallyCollapsed
            ? " - collapsed while dragging"
            : ""}
        </div>
      ) : (
        <SortableContext
          items={categoryItems.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {categoryItems.map((item) => (
              <SortableItem
                key={item.id}
                item={item}
                onToggle={onToggle}
                onDelete={onDelete}
                onEdit={onEdit}
                onTransfer={onTransfer}
                editingId={editingId}
                editValue={editValue}
                setEditValue={setEditValue}
                saveEdit={saveEdit}
                handleKeyDown={handleKeyDown}
                inputRef={inputRef}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

export function CategorizedGroceryList({
  weekId,
  items: initialItems,
}: CategorizedGroceryListProps) {
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [items, setItems] = useState(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [emptyCategories, setEmptyCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [itemsToTransfer, setItemsToTransfer] = useState<GroceryItem[]>([]);
  const [addingToCategory, setAddingToCategory] = useState<string | null>(null);
  const [addItemValue, setAddItemValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const addItemInputRef = useRef<HTMLInputElement>(null);

  // Load category order from localStorage
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem(`grocery-category-order-${weekId}`);
    return stored ? JSON.parse(stored) : [];
  });

  // Load collapsed categories from localStorage
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    () => {
      if (typeof window === "undefined") return new Set();
      const stored = localStorage.getItem(
        `grocery-collapsed-categories-${weekId}`
      );
      return stored ? new Set(JSON.parse(stored)) : new Set();
    }
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (addingToCategory && addItemInputRef.current) {
      addItemInputRef.current.focus();
    }
  }, [addingToCategory]);

  // Save category order to localStorage
  useEffect(() => {
    if (categoryOrder.length > 0) {
      localStorage.setItem(
        `grocery-category-order-${weekId}`,
        JSON.stringify(categoryOrder)
      );
    }
  }, [categoryOrder, weekId]);

  // Save collapsed categories to localStorage
  useEffect(() => {
    localStorage.setItem(
      `grocery-collapsed-categories-${weekId}`,
      JSON.stringify(Array.from(collapsedCategories))
    );
  }, [collapsedCategories, weekId]);

  // Group items by category
  const groupedItems = items.reduce((acc, item) => {
    const category = item.category || "Uncategorized";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, GroceryItem[]>);

  // Sort items within each category: unchecked first, then by order
  Object.keys(groupedItems).forEach((category) => {
    groupedItems[category].sort((a, b) => {
      // First sort by checked status (unchecked first)
      if (a.checked !== b.checked) {
        return a.checked ? 1 : -1;
      }
      // Then by order
      return (a.order ?? 0) - (b.order ?? 0);
    });
  });

  // Get unique categories from existing items
  const existingCategories = Array.from(
    new Set(items.map((i) => i.category).filter(Boolean))
  );

  // Merge empty categories with categories that have items
  const allCategories = Array.from(
    new Set([
      ...Object.keys(groupedItems),
      ...emptyCategories.filter((cat) => !groupedItems[cat]),
    ])
  );

  // Sort categories by custom order, then alphabetically for new categories
  const categories = [...allCategories].sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a);
    const bIndex = categoryOrder.indexOf(b);

    // Both in custom order
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }

    // Only a is in custom order
    if (aIndex !== -1) return -1;

    // Only b is in custom order
    if (bIndex !== -1) return 1;

    // Neither in custom order, sort alphabetically
    return a.localeCompare(b);
  });

  // Initialize category order if empty and we have categories
  useEffect(() => {
    if (categoryOrder.length === 0 && allCategories.length > 0) {
      setCategoryOrder([...allCategories].sort());
    }
  }, [allCategories.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const { execute: createItem, isPending: isCreating } = useServerAction(
    createGroceryItemAction,
    {
      onSuccess: ({ data }) => {
        setItems((prev) => [...prev, data.groceryItem]);
        setNewItemName("");
        setNewItemCategory("");
        toast.success("Item added");
      },
      onError: ({ err }) => {
        toast.error(err.message || "Failed to add item");
      },
    }
  );

  const { execute: deleteItem } = useServerAction(deleteGroceryItemAction, {
    onSuccess: () => {
      toast.success("Item deleted");
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to delete item");
    },
  });

  const { execute: toggleItem } = useServerAction(toggleGroceryItemAction, {
    onSuccess: ({ data }) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === data.groceryItem.id ? data.groceryItem : item
        )
      );
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to update item");
    },
  });

  const { execute: updateItem } = useServerAction(updateGroceryItemAction, {
    onSuccess: ({ data }) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === data.groceryItem.id ? data.groceryItem : item
        )
      );
      setEditingId(null);
      toast.success("Item updated");
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to update item");
    },
  });

  const { execute: bulkUpdate } = useServerAction(
    bulkUpdateGroceryItemsAction,
    {
      onError: ({ err }) => {
        toast.error(err.message || "Failed to reorder items");
      },
    }
  );

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    // Remove category from empty categories if it exists
    if (newItemCategory && emptyCategories.includes(newItemCategory)) {
      setEmptyCategories((prev) =>
        prev.filter((cat) => cat !== newItemCategory)
      );
    }

    await createItem({
      weekId,
      name: newItemName.trim(),
      category: newItemCategory || undefined,
    });
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    // Check if category already exists
    if (
      existingCategories.includes(newCategoryName.trim()) ||
      emptyCategories.includes(newCategoryName.trim())
    ) {
      toast.error("Category already exists");
      return;
    }

    setEmptyCategories((prev) => [...prev, newCategoryName.trim()]);
    setNewCategoryName("");
    toast.success("Category created");
  };

  const handleDeleteEmptyCategory = (category: string) => {
    setEmptyCategories((prev) => prev.filter((cat) => cat !== category));
    toast.success("Category deleted");
  };

  const handleToggle = async (id: string, checked: boolean) => {
    await toggleItem({ id, checked });
  };

  const handleDelete = async (id: string) => {
    // Find the item before deleting to check category
    const deletedItem = items.find((item) => item.id === id);

    await deleteItem({ id });

    // Update state after successful deletion
    setItems((prev) => {
      const newItems = prev.filter((item) => item.id !== id);

      // If this was the last item in a category, convert to empty category
      if (deletedItem?.category) {
        const remainingInCategory = newItems.filter(
          (item) => item.category === deletedItem.category
        );
        if (remainingInCategory.length === 0) {
          setEmptyCategories((prevCats) => {
            if (!prevCats.includes(deletedItem.category!)) {
              return [...prevCats, deletedItem.category!];
            }
            return prevCats;
          });
        }
      }

      return newItems;
    });
  };

  const startEdit = (item: GroceryItem) => {
    setEditingId(item.id);
    setEditValue(item.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const saveEdit = async () => {
    if (!editingId || !editValue.trim()) {
      cancelEdit();
      return;
    }

    await updateItem({ id: editingId, name: editValue.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  const startAddingToCategory = (category: string) => {
    setAddingToCategory(category);
    setAddItemValue("");
  };

  const cancelAddToCategory = () => {
    setAddingToCategory(null);
    setAddItemValue("");
  };

  const saveAddItem = async (category: string) => {
    if (!addItemValue.trim()) {
      cancelAddToCategory();
      return;
    }

    await createItem({
      weekId,
      name: addItemValue.trim(),
      category: category
    });

    cancelAddToCategory();
  };

  const handleAddKeyDown = (e: React.KeyboardEvent, category: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveAddItem(category);
    } else if (e.key === "Escape") {
      cancelAddToCategory();
    }
  };

  const handleToggleCollapse = (category: string) => {
    setCollapsedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const handleOpenTransferDialog = (items: GroceryItem[]) => {
    setItemsToTransfer(items);
    setTransferDialogOpen(true);
  };

  const handleTransferItem = (item: GroceryItem) => {
    handleOpenTransferDialog([item]);
  };

  const handleTransferCategory = (category: string, mode: "all" | "unchecked") => {
    const categoryItems = items.filter(
      (item) => (item.category || "Uncategorized") === category
    );
    const filteredItems =
      mode === "unchecked"
        ? categoryItems.filter((item) => !item.checked)
        : categoryItems;
    handleOpenTransferDialog(filteredItems);
  };

  const handleTransferAllUnchecked = () => {
    const unchecked = items.filter((item) => !item.checked);
    handleOpenTransferDialog(unchecked);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;

    // Check if we're dragging a category
    if (id.startsWith("category-")) {
      setActiveCategoryId(id);
    } else {
      // Dragging an item
      setActiveId(id);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;

    // Skip if dragging a category
    if (activeId.startsWith("category-")) return;

    const activeItem = items.find((i) => i.id === activeId);
    const overItem = items.find((i) => i.id === over.id);

    if (!activeItem || !overItem) return;

    const activeCategory = activeItem.category || "Uncategorized";
    const overCategory = overItem.category || "Uncategorized";

    if (activeCategory !== overCategory) {
      // Moving to a different category
      setItems((prevItems) => {
        const updatedItems = prevItems.map((item) => {
          if (item.id === activeItem.id) {
            return { ...item, category: overItem.category };
          }
          return item;
        });
        return updatedItems;
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = active.id as string;
    const overId = over?.id as string;

    // Clear active states
    setActiveId(null);
    setActiveCategoryId(null);

    if (!over || active.id === over.id) return;

    // Check if we're dragging a category
    if (activeId.startsWith("category-")) {
      const activeCategoryName = activeId.replace("category-", "");
      const overCategoryName = overId.replace("category-", "");

      setCategoryOrder((currentOrder) => {
        // Get all current categories
        const allCats = [...allCategories];

        // If we don't have a custom order yet, initialize with current categories
        const workingOrder = currentOrder.length === 0 ? allCats : currentOrder;

        // Add any new categories that aren't in the order yet
        const missingCategories = allCats.filter(
          (cat) => !workingOrder.includes(cat)
        );
        const fullOrder = [...workingOrder, ...missingCategories];

        const oldIndex = fullOrder.indexOf(activeCategoryName);
        const newIndex = fullOrder.indexOf(overCategoryName);

        if (oldIndex === -1 || newIndex === -1) return fullOrder;

        return arrayMove(fullOrder, oldIndex, newIndex);
      });
    } else {
      // Dragging an item
      const activeItem = items.find((i) => i.id === activeId);
      const overItem = items.find((i) => i.id === overId);

      if (!activeItem || !overItem) return;

      const overCategory = overItem.category || "Uncategorized";

      // Get items in the target category
      const categoryItems = items.filter(
        (i) => (i.category || "Uncategorized") === overCategory
      );

      const oldIndex = categoryItems.findIndex((i) => i.id === activeId);
      const newIndex = categoryItems.findIndex((i) => i.id === overId);

      if (oldIndex === -1 || newIndex === -1) return;

      // Reorder within category
      const reorderedCategoryItems = arrayMove(
        categoryItems,
        oldIndex,
        newIndex
      );

      // Update the order property on each reordered item
      const reorderedWithNewOrder: GroceryItem[] = reorderedCategoryItems.map(
        (item, index) => ({
          ...item,
          order: index,
          category: overCategory === "Uncategorized" ? null : overCategory,
        })
      );

      // Update all items
      const otherItems = items.filter(
        (i) => (i.category || "Uncategorized") !== overCategory
      );

      const allItems = [...otherItems, ...reorderedWithNewOrder];

      // Update state first with new order values
      setItems(allItems);

      // Prepare bulk update
      const updates = reorderedWithNewOrder.map((item) => ({
        id: item.id,
        category: item.category || undefined,
        order: item.order ?? 0,
      }));

      // Send to server after state update
      await bulkUpdate({ weekId, updates });
    }
  };

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;

  const uncheckedItems = items.filter((item) => !item.checked);

  return (
    <Card>
      <CardContent className="p-6">
        {/* Transfer All Unchecked Button */}
        {uncheckedItems.length > 0 && (
          <div className="flex justify-end mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTransferAllUnchecked}
            >
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Transfer All Unchecked ({uncheckedItems.length})
            </Button>
          </div>
        )}

        <div className="space-y-6 mb-6">
          <form onSubmit={handleAddCategory} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="category-name" className="text-sm font-medium">
                Add New Category
              </Label>
              <div className="flex gap-2">
                <Input
                  id="category-name"
                  placeholder="Category name..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={!newCategoryName.trim()}
                >
                  <Plus className="h-4 w-4 mr-2 dark:text-cream-200" />
                  Add
                </Button>
              </div>
            </div>
          </form>

          <form onSubmit={handleAddItem} className="space-y-3">
            <Label className="text-sm font-medium">Add Grocery Item</Label>
            <div className="space-y-2">
              <Input
                placeholder="Item name..."
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                disabled={isCreating}
              />
              <Input
                placeholder="Category (optional)"
                value={newItemCategory}
                onChange={(e) => setNewItemCategory(e.target.value)}
                disabled={isCreating}
                list="categories"
              />
              <datalist id="categories">
                {allCategories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
              <Button
                type="submit"
                disabled={isCreating || !newItemName.trim()}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2 dark:text-cream-100" />
                Add Item
              </Button>
            </div>
          </form>
        </div>

        {items.length === 0 && emptyCategories.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No grocery items yet. Add your first item or category above.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={[
                ...categories.map((cat) => `category-${cat}`),
                ...items.map((item) => item.id),
              ]}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-6">
                {categories.map((category) => {
                  const categoryItems = groupedItems[category] || [];
                  const isEmpty = categoryItems.length === 0;
                  // Collapse all categories when dragging, except empty ones
                  const isCollapsed = activeCategoryId !== null && !isEmpty;
                  const isManuallyCollapsed = collapsedCategories.has(category);

                  return (
                    <SortableCategory
                      key={category}
                      category={category}
                      categoryItems={categoryItems}
                      isEmpty={isEmpty}
                      isCollapsed={isCollapsed}
                      isManuallyCollapsed={isManuallyCollapsed}
                      onToggleCollapse={handleToggleCollapse}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                      onDeleteEmptyCategory={handleDeleteEmptyCategory}
                      onEdit={startEdit}
                      onTransfer={handleTransferItem}
                      onTransferCategory={handleTransferCategory}
                      editingId={editingId}
                      editValue={editValue}
                      setEditValue={setEditValue}
                      saveEdit={saveEdit}
                      handleKeyDown={handleKeyDown}
                      inputRef={inputRef}
                      addingToCategory={addingToCategory}
                      addItemValue={addItemValue}
                      setAddItemValue={setAddItemValue}
                      startAddingToCategory={startAddingToCategory}
                      saveAddItem={saveAddItem}
                      handleAddKeyDown={handleAddKeyDown}
                      addItemInputRef={addItemInputRef}
                    />
                  );
                })}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeItem ? (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-background border shadow-lg">
                  <GripVertical className="h-4 w-4 text-muted-foreground dark:text-cream-300" />
                  <Checkbox checked={activeItem.checked} disabled />
                  <span
                    className={
                      activeItem.checked
                        ? "line-through text-muted-foreground"
                        : ""
                    }
                  >
                    {activeItem.name}
                  </span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {/* Transfer Items Dialog */}
        <TransferItemsDialog
          sourceWeekId={weekId}
          items={itemsToTransfer}
          open={transferDialogOpen}
          onOpenChange={setTransferDialogOpen}
          onSuccess={() => {
            setTransferDialogOpen(false);
            setItemsToTransfer([]);
          }}
        />
      </CardContent>
    </Card>
  );
}
