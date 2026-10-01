/** What a page shows while its data loads: the header and grey blocks of the list's shape. */
export function PageSkeleton({ title, rows = 6 }: { title: string; rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="sr-only">Loading {title.toLowerCase()}.</p>
      <div className="mb-5 h-24 animate-pulse rounded-md bg-paper-sunk" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-sm bg-paper-sunk" />
        ))}
      </div>
    </div>
  );
}
