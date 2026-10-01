import type { ReactNode } from "react";

import { AuthFrame } from "./auth-frame";
import { AuthRailNav, AuthStepProvider } from "./auth-rail";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AuthStepProvider>
      <AuthFrame rail={<AuthRailNav />}>{children}</AuthFrame>
    </AuthStepProvider>
  );
}
