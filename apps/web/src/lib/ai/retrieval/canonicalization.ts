const SENTINEL_NULL_VALUES = new Set([
  "",
  "-",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
]);

const SECOND_EPOCH_CUTOFF = 100_000_000_000;

export function canonicalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalizedValue = value.trim().replace(/\s+/g, " ");
  if (SENTINEL_NULL_VALUES.has(normalizedValue.toLowerCase())) return null;

  return normalizedValue;
}

export function canonicalizeCase(value: unknown): string | null {
  return canonicalizeNullableString(value)?.toLocaleLowerCase("en-US") ?? null;
}

export function canonicalizeTags(value: unknown): string[] {
  let tagValues: unknown[] = [];

  if (Array.isArray(value)) tagValues = value;
  else if (typeof value === "string") {
    try {
      const parsedValue: unknown = JSON.parse(value);
      tagValues = Array.isArray(parsedValue) ? parsedValue : value.split(",");
    } catch {
      tagValues = value.split(",");
    }
  }

  return Array.from(
    new Set(
      tagValues
        .map(canonicalizeCase)
        .filter((tag): tag is string => tag !== null),
    ),
  ).sort((leftTag, rightTag) => leftTag.localeCompare(rightTag));
}

export function canonicalizeIngredients(value: unknown): string[] {
  let ingredientValue = value;

  if (typeof ingredientValue === "string") {
    const stringValue = ingredientValue;
    try {
      ingredientValue = JSON.parse(stringValue) as unknown;
    } catch {
      ingredientValue = stringValue.split("\n");
    }
  }

  if (!Array.isArray(ingredientValue)) return [];

  const ingredients = ingredientValue.flatMap((section) => {
    if (typeof section === "string") return [section];
    if (!section || typeof section !== "object") return [];

    const items = "items" in section ? section.items : null;
    return Array.isArray(items) ? items : [];
  });

  return ingredients
    .map(canonicalizeNullableString)
    .filter((ingredient): ingredient is string => ingredient !== null);
}

export function canonicalizeLegacyDate(value: unknown): Date | null {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());

  if (typeof value === "number") return dateFromEpoch(value);

  const normalizedValue = canonicalizeNullableString(value);
  if (!normalizedValue) return null;

  const numericValue = Number(normalizedValue);
  if (Number.isFinite(numericValue)) return dateFromEpoch(numericValue);

  const isoDateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizedValue);
  if (isoDateOnlyMatch) {
    const parsedDate = new Date(`${normalizedValue}T00:00:00.000Z`);
    return isSameUtcDate({ date: parsedDate, expected: normalizedValue }) ? parsedDate : null;
  }

  const parsedDate = new Date(normalizedValue);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export function toIsoTimestamp(value: unknown): string | null {
  return canonicalizeLegacyDate(value)?.toISOString() ?? null;
}

export function toIsoDate(value: unknown): string | null {
  return toIsoTimestamp(value)?.slice(0, 10) ?? null;
}

export function tokenizeSearchText(value: unknown): string[] {
  const normalizedValue = canonicalizeCase(value);
  if (!normalizedValue) return [];

  return Array.from(
    new Set(
      normalizedValue
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .slice(0, 12),
    ),
  );
}

function dateFromEpoch(value: number): Date | null {
  if (!Number.isFinite(value)) return null;

  const milliseconds = Math.abs(value) < SECOND_EPOCH_CUTOFF ? value * 1000 : value;
  const parsedDate = new Date(milliseconds);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function isSameUtcDate({ date, expected }: { date: Date; expected: string }): boolean {
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === expected;
}
