/**
 * Parse an ISO date string (YYYY-MM-DD) and create a Date in local timezone
 * This avoids timezone issues where Date("2025-10-31") is parsed as UTC midnight
 * and displayed as the previous day in western timezones
 */
export function parseISODate(isoDateString: string | Date): Date {
  if (isoDateString instanceof Date) {
    return isoDateString;
  }

  const [year, month, day] = isoDateString.split('T')[0].split('-');
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
}

/**
 * Format a date for display, handling both Date objects and ISO strings
 */
export function formatDisplayDate(date: string | Date): string {
  const localDate = parseISODate(date);
  return localDate.toLocaleDateString();
}
