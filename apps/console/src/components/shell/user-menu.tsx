import { signOutAction } from "~/app/(auth)/actions";

/** The signed-in person, their role, and sign out. A native disclosure, so it works without script. */
export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-sm px-2 py-2 hover:bg-bw-surface-sunken [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-bw-border-strong bg-bw-surface-sunken font-mono text-sm font-semibold text-bw-text">
          {(name.trim()[0] ?? email[0] ?? "?").toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-bw-text">{name}</span>
          <span className="bw-label block truncate">{role}</span>
        </span>
        <span aria-hidden className="text-xs text-bw-text-muted group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="mt-1 rounded-sm border border-bw-border bg-bw-surface p-1 md:absolute md:bottom-full md:left-0 md:right-0 md:mb-1 md:shadow-lg">
        <p className="truncate px-3 py-2 text-xs text-bw-text-muted">{email}</p>
        <form action={signOutAction}>
          <button type="submit" className="min-h-10 w-full rounded-sm px-3 py-2 text-left text-sm text-bw-text hover:bg-bw-surface-sunken">
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
