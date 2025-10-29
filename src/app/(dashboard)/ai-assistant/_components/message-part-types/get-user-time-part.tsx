import type { GetUserTimeResult } from "./types";

export const GetUserTimePart = ({ result }: { result: GetUserTimeResult | undefined }) => {
  if (!result || !result.success || !result.formattedTime) {
    return (
      <div className="bg-red-950/80 border-2 border-red-500 rounded-lg p-3 text-sm">
        <div className="font-semibold text-red-100">
          ❌ Failed to get time
        </div>
        {result?.error && (
          <div className="text-red-200 text-xs mt-1">
            {result?.error || 'Failed to get time'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-blue-950/80 border-2 border-blue-500 rounded-lg p-3 text-sm">
      <div className="font-semibold text-blue-100 mb-1 flex items-center gap-2">
        🕐 Current time
      </div>
      <div className="text-blue-50 text-sm">
        {result.formattedTime}
      </div>
    </div>
  );
};
