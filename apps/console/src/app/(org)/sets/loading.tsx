/** Shown while a set page loads: the page's shape in quiet blocks, announced once. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="flex animate-pulse flex-col gap-4">
      <div className="h-8 w-48 rounded-sm bg-paper-sunk" />
      <div className="h-4 w-96 max-w-full rounded-sm bg-paper-sunk" />
      <div className="h-14 rounded-md bg-paper-sunk" />
      <div className="h-64 rounded-md bg-paper-sunk" />
    </div>
  );
}
