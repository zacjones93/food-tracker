import type { UpdateWeekResult } from "./types";

export const UpdateWeekPart = ({ result }: { result: UpdateWeekResult | undefined }) => {
  return (
    <div className="bg-orange-950/80 border-2 border-orange-500 rounded-lg p-3 text-sm">
      <div className="font-semibold text-orange-100 mb-1">
        ✏️ Week updated
      </div>
      {result?.message && (
        <div className="text-orange-50 text-xs mb-1">
          {result.message}
        </div>
      )}
      {result?.updates && Object.keys(result.updates).length > 0 && (
        <div className="text-orange-200 text-xs">
          Updated: {Object.keys(result.updates).filter(k => k !== 'updatedAt').join(', ')}
        </div>
      )}
    </div>
  );
};
