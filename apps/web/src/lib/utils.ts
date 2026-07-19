import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Filters out undefined values from an object.
 * Useful for Drizzle ORM's .set() method which only accepts defined values.
 * Only fields with actual values will be included in the update.
 *
 * @param obj - The object to filter
 * @returns A new object with undefined values removed
 */
export function filterNullishValues<T extends Record<string, unknown>>(obj: T): Record<string, Exclude<T[keyof T], undefined>> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Record<string, Exclude<T[keyof T], undefined>>;
}
