interface LegalConfigurationNoticeProps {
  missingKeys: string[];
}

export function LegalConfigurationNotice({
  missingKeys,
}: LegalConfigurationNoticeProps) {
  if (missingKeys.length === 0) return null;

  return (
    <aside className="mb-8 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-foreground">
      <p className="font-semibold">Launch configuration required</p>
      <p className="mt-1 text-muted-foreground">
        The operator must configure: {missingKeys.join(", ")}. These values are intentionally not
        guessed.
      </p>
    </aside>
  );
}
