import { Card } from './card';
import { Trash2, GripVertical } from "@/components/ui/themed-icons";

interface RecipeCardProps {
  title: string;
  emoji: string;
  category?: string;
  onDelete?: () => void;
  draggable?: boolean;
  className?: string;
}

export function RecipeCard({
  title,
  emoji,
  category,
  onDelete,
  draggable = true,
  className
}: RecipeCardProps) {
  return (
    <Card hover className={`group ${className}`}>
      <div className="flex items-center gap-4 p-6">
        {/* Drag handle */}
        {draggable && (
          <div className="text-mystic-400 hover:text-mystic-600 cursor-grab active:cursor-grabbing">
            <GripVertical className="w-5 h-5" />
          </div>
        )}

        {/* Emoji icon */}
        <div className="text-3xl">{emoji}</div>

        {/* Content */}
        <div className="flex-1">
          <h3 className="font-heading text-lg text-mystic-800 font-medium">
            {title}
          </h3>
          {category && (
            <span className="inline-block mt-1 px-2 py-0.5 bg-mystic-100 text-mystic-700 text-xs rounded-full">
              {category}
            </span>
          )}
        </div>

        {/* Delete button */}
        {onDelete && (
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-mystic-400 hover:text-red-600 p-2"
            aria-label="Delete recipe"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>
    </Card>
  );
}
