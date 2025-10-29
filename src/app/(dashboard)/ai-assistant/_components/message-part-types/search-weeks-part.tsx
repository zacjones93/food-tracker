import Link from "next/link";
import type { SearchWeeksResult } from "./types";

export const SearchWeeksPart = ({ result }: { result: SearchWeeksResult | undefined }) => {
  const weeks = result?.weeks || [];
  const count = result?.count || 0;

  return (
    <div className="bg-cyan-950/80 border-2 border-cyan-500 rounded-lg p-3 text-sm">
      <div className="font-semibold text-cyan-100 mb-2 flex items-center gap-2">
        📅 Found {count} week{count !== 1 ? 's' : ''}
      </div>
      {weeks.length > 0 && (
        <div className="space-y-2 text-xs">
          {weeks.slice(0, 3).map((week, idx) => (
            <div key={idx} className="text-cyan-50">
              <div className="flex items-center gap-2 font-medium mb-1">
                <span>{week.emoji || '📅'}</span>
                <Link
                  href={`/schedule/${week.id}`}
                  className="hover:underline hover:text-cyan-200 transition-colors"
                >
                  {week.name}
                </Link>
                {week.status && (
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    week.status === 'current' ? 'bg-cyan-500 text-white' :
                    week.status === 'upcoming' ? 'bg-blue-500 text-white' :
                    'bg-gray-600 text-gray-100'
                  }`}>
                    {week.status}
                  </span>
                )}
              </div>
              {week.recipes && week.recipes.length > 0 && (
                <div className="text-cyan-200 text-xs ml-6">
                  {week.recipes.length} recipe{week.recipes.length !== 1 ? 's' : ''} planned
                </div>
              )}
            </div>
          ))}
          {weeks.length > 3 && (
            <div className="text-cyan-200 italic">
              ...and {weeks.length - 3} more
            </div>
          )}
        </div>
      )}
    </div>
  );
};
