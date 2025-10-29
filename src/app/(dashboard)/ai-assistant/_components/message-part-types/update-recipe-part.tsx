import type { UpdateRecipeResult } from "./types";

export const UpdateRecipePart = ({ result }: { result: UpdateRecipeResult | undefined }) => {
  return (
    <div className="bg-yellow-950/80 border-2 border-yellow-500 rounded-lg p-3 text-sm">
      <div className="font-semibold text-yellow-100 mb-1">
        ✏️ Recipe updated
      </div>
      {result?.message && (
        <div className="text-yellow-50 text-xs mb-1">
          {result.message}
        </div>
      )}
      {result?.updates && Object.keys(result.updates).length > 0 && (
        <div className="text-yellow-200 text-xs">
          Updated: {Object.keys(result.updates).filter(k => k !== 'updatedAt').join(', ')}
        </div>
      )}
    </div>
  );
};
