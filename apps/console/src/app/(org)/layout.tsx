import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SideNav } from "~/components/shell/nav";
import { UserMenu } from "~/components/shell/user-menu";
import { HeaderLogo } from "~/components/shell/wordmark";
import { ToastProvider } from "~/components/ui";
import { requireConsole } from "~/server/auth/console";

export const metadata: Metadata = { title: "Bandwise console" };

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", editor: "Editor", reviewer: "Reviewer", viewer: "Viewer" };

// Every page under (org) needs a signed-in member with two-factor on. requireConsole redirects
// everyone else, and pages call it again for the context they pass to runOperation.
export default async function OrgLayout({ children }: { children: ReactNode }) {
  const { org, user, ctx } = await requireConsole();
  const header = (
    <div className="flex flex-col gap-2">
      <HeaderLogo />
      <span className="bw-label truncate" title={org.name}>
        {org.name}
      </span>
    </div>
  );
  // The phone header carries the same lockup at its 160px minimum.
  const compactHeader = (
    <div className="flex min-w-0 items-center gap-3">
      <HeaderLogo size="sm" />
      <span className="truncate text-sm font-semibold text-bw-text" title={org.name}>
        {org.name}
      </span>
    </div>
  );
  return (
    <ToastProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:border focus:border-bw-border-strong focus:bg-bw-surface focus:px-3 focus:py-2 focus:text-bw-text">
        Skip to content
      </a>
      <div className="min-h-dvh bg-bw-bg md:flex">
        <SideNav header={header} compactHeader={compactHeader} footer={<UserMenu name={user.name} email={user.email} role={ROLE_LABEL[ctx.actor.role] ?? ctx.actor.role} />} />
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8 xl:px-12 xl:py-10">
          <div className="mx-auto max-w-[75rem]">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
