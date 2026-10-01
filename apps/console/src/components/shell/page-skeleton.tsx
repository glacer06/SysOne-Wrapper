/** What a page shows while its data loads: the header and grey blocks of the list's shape. */
export function PageSkeleton({ title, rows = 6 }: { title: string; rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <h1 className="mb-6 bw-page-title">{title}</h1>
      <p className="sr-only">Loading {title.toLowerCase()}.</p>
      <div className="mb-5 h-24 rounded-md bg-bw-surface-sunken" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-10 rounded-sm bg-bw-surface-sunken" />
        ))}
      </div>
    </div>
  );
}
