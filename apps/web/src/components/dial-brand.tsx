interface DialBrandProps {
  detail?: string;
  size?: "compact" | "standard";
}

export function DialBrand({
  detail = "Coffee recipe destination",
  size = "compact",
}: DialBrandProps) {
  const dimension = size === "standard" ? 44 : 28;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <picture className="shrink-0">
        <source
          media="(prefers-color-scheme: dark)"
          srcSet="/assets/dial-your-espresso-mark-dark.png"
        />
        <img
          alt=""
          aria-hidden="true"
          className="rounded-xl"
          height={dimension}
          src="/assets/dial-your-espresso-mark.png"
          width={dimension}
        />
      </picture>
      <div className="min-w-0 leading-tight">
        <div className={size === "standard" ? "font-semibold" : "text-sm font-semibold"}>
          Dial Your Espresso
        </div>
        {detail ? (
          <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
        ) : null}
      </div>
    </div>
  );
}
