interface CursorEnvelope {
  version: 1;
  kind: string;
  fingerprint: string;
  position: Record<string, unknown>;
}

export interface DecodedCursor {
  position: Record<string, unknown>;
}

export function fingerprintInput(value: unknown): string {
  const input = stableStringify(value);
  let hash = 2_166_136_261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return (hash >>> 0).toString(36);
}

export function encodeCursor({
  kind,
  fingerprint,
  position,
}: {
  kind: string;
  fingerprint: string;
  position: Record<string, unknown>;
}): string {
  const envelope: CursorEnvelope = { version: 1, kind, fingerprint, position };
  const bytes = new TextEncoder().encode(JSON.stringify(envelope));
  let binaryValue = "";

  for (const byte of bytes) binaryValue += String.fromCharCode(byte);

  return btoa(binaryValue).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeCursor({
  cursor,
  expectedKind,
  expectedFingerprint,
}: {
  cursor: string;
  expectedKind: string;
  expectedFingerprint: string;
}): DecodedCursor | null {
  try {
    const base64Value = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const paddedValue = base64Value.padEnd(Math.ceil(base64Value.length / 4) * 4, "=");
    const binaryValue = atob(paddedValue);
    const bytes = Uint8Array.from(binaryValue, (character) => character.charCodeAt(0));
    const parsedValue: unknown = JSON.parse(new TextDecoder().decode(bytes));

    if (!isCursorEnvelope(parsedValue)) return null;
    if (parsedValue.kind !== expectedKind) return null;
    if (parsedValue.fingerprint !== expectedFingerprint) return null;

    return { position: parsedValue.position };
  } catch {
    return null;
  }
}

function isCursorEnvelope(value: unknown): value is CursorEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === 1 &&
    "kind" in value &&
    typeof value.kind === "string" &&
    "fingerprint" in value &&
    typeof value.fingerprint === "string" &&
    "position" in value &&
    typeof value.position === "object" &&
    value.position !== null &&
    !Array.isArray(value.position)
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value) ?? "null";

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
