/** The product mark: a small band ruler (high, medium, low) beside the name. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <span aria-hidden className="flex h-4 w-6 overflow-hidden rounded-[1px] border border-edge">
        <span className="w-1/3 bg-signal" />
        <span className="band-medium w-1/3 text-ink-3" />
        <span className="band-low w-1/3 text-ink-3" />
      </span>
      <span className={compact ? "text-sm font-semibold tracking-tight" : "text-lg font-semibold tracking-tight"}>Bandwise</span>
    </span>
  );
}
