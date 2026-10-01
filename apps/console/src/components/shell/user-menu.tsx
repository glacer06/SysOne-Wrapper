import { signOutAction } from "~/app/(auth)/actions";

/** The signed-in person, their role, and sign out. A native disclosure, so it works without script. */
export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-sm px-2 py-2 hover:bg-paper-sunk [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper-sunk text-sm font-medium text-ink">
          {(name.trim()[0] ?? email[0] ?? "?").toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{name}</span>
          <span className="block truncate text-xs text-ink-3">{role}</span>
        </span>
        <span aria-hidden className="text-xs text-ink-3 group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="mt-1 rounded-sm border border-rule bg-paper-raised p-1 md:absolute md:bottom-full md:left-0 md:right-0 md:mb-1">
        <p className="truncate px-3 py-2 text-xs text-ink-3">{email}</p>
        <form action={signOutAction}>
          <button type="submit" className="w-full rounded-sm px-3 py-2 text-left text-sm text-ink hover:bg-paper-sunk">
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
