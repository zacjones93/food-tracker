"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GripVertical, Plus, Trash2 } from "@/components/ui/themed-icons";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";

export interface IngredientSection {
  id: string;
  title?: string;
  items: string[];
}

interface SortableSectionProps {
  section: IngredientSection;
  onUpdate: (id: string, updates: Partial<IngredientSection>) => void;
  onDelete: (id: string) => void;
}

function SortableSection({
  section,
  onUpdate,
  onDelete,
}: SortableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const [itemsText, setItemsText] = useState(section.items.join("\n"));

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleItemsChange = (text: string) => {
    setItemsText(text);
    const items = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    onUpdate(section.id, { items });
  };

  return (
    <Card ref={setNodeRef} style={style} className="p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none mt-2"
        >
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Section title (e.g., Main Dish, Sauce) - optional"
              value={section.title || ""}
              onChange={(e) =>
                onUpdate(section.id, { title: e.target.value || undefined })
              }
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(section.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            placeholder="Enter ingredients (one per line)&#10;1 cup flour&#10;2 eggs&#10;1/2 cup milk"
            value={itemsText}
            onChange={(e) => handleItemsChange(e.target.value)}
            className="min-h-[120px] font-mono text-sm"
          />
        </div>
      </div>
    </Card>
  );
}

interface SortableIngredientSectionsProps {
  sections: IngredientSection[];
  onChange: (sections: IngredientSection[]) => void;
}

export function SortableIngredientSections({
  sections,
  onChange,
}: SortableIngredientSectionsProps) {
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sections.findIndex((s) => s.id === active.id);
      const newIndex = sections.findIndex((s) => s.id === over.id);
      onChange(arrayMove(sections, oldIndex, newIndex));
    }
  };

  const handleUpdate = (id: string, updates: Partial<IngredientSection>) => {
    onChange(
      sections.map((section) =>
        section.id === id ? { ...section, ...updates } : section
      )
    );
  };

  const handleDelete = (id: string) => {
    onChange(sections.filter((section) => section.id !== id));
  };

  const handleAddSection = () => {
    const newSection: IngredientSection = {
      id: `section-${Date.now()}`,
      title: undefined,
      items: [],
    };
    onChange([...sections, newSection]);
  };

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {sections.map((section) => (
              <SortableSection
                key={section.id}
                section={section}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button variant="outline" onClick={handleAddSection} className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Add Section
      </Button>

      {sections.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p className="mb-2">No ingredient sections yet.</p>
          <p className="text-sm">
            Click &quot;Add Section&quot; to create your first section.
          </p>
        </div>
      )}
    </div>
  );
}
