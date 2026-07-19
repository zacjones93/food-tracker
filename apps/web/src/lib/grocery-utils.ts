import { format } from "date-fns";

export function formatWeekDisplay(week: {
  name?: string | null;
  startDate: Date | null;
  endDate: Date | null;
}): string {
  if (!week.startDate || !week.endDate) {
    return week.name || "Unnamed Week";
  }
  const start = format(week.startDate, "MMM d");
  const end = format(week.endDate, "MMM d, yyyy");
  return week.name || `Week of ${start} - ${end}`;
}

export function groupItemsByCategory<
  T extends { id: string; name: string; category?: string | null }
>(items: T[]): Array<{ name: string; items: T[] }> {
  const grouped = new Map<string, T[]>();

  items.forEach((item) => {
    const category = item.category || "Uncategorized";
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(item);
  });

  return Array.from(grouped.entries()).map(([name, items]) => ({
    name,
    items,
  }));
}
