export default function Loading() {
  return (
    <div role="status" aria-label="Loading releases" className="flex flex-col gap-6">
      <div className="h-8 w-48 animate-pulse rounded-sm bg-paper-sunk" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-40 animate-pulse rounded-md border border-rule bg-paper-raised" />
      ))}
    </div>
  );
}
