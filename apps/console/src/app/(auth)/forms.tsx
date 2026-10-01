"use client";

import Link from "next/link";
import { type RefObject, useActionState, useEffect, useRef, useState } from "react";

import { Button, InlineAlert, Input } from "~/components/ui";

import { useBackupStep } from "./auth-rail";
import {
  finishSetupAction,
  type FormState,
  resetPasswordAction,
  type ResetState,
  type SetupState,
  signInAction,
  startSetupAction,
  verifyCodeAction,
} from "./actions";

/**
 * After a failed attempt React resets the form and a clicked submit button drops focus to the
 * page, so focus goes back to the field to fill in again.
 */
function useFocusOnError(error: string | undefined, state: object, field: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    if (error !== undefined) field.current?.focus();
  }, [error, state, field]);
}

export function SignInForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signInAction, {});
  const password = useRef<HTMLInputElement>(null);
  useFocusOnError(state.error, state, password);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <InlineAlert kind="error">{state.error}</InlineAlert> : null}
      <Input label="Email" name="email" type="email" autoComplete="username" required autoFocus defaultValue={state.email} />
      <Input ref={password} label="Password" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" variant="primary" pending={pending}>
        {pending ? "Signing in" : "Sign in"}
      </Button>
    </form>
  );
}

export function TwoFactorForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyCodeAction, {});
  const [backup, setBackup] = useState(false);
  // The rail points at the backup step while one is in use. Display only.
  useBackupStep(backup);
  const code = useRef<HTMLInputElement>(null);
  useFocusOnError(state.error, state, code);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <InlineAlert kind="error">{state.error}</InlineAlert> : null}
      <input type="hidden" name="backup" value={backup ? "1" : "0"} />
      {backup ? (
        <Input key="backup" ref={code} label="Backup code" name="code" autoComplete="one-time-code" required autoFocus spellCheck={false} />
      ) : (
        <Input
          key="totp"
          ref={code}
          label="Code from your authenticator app"
          name="code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          autoComplete="one-time-code"
          required
          autoFocus
          className="font-mono tracking-[0.3em]"
        />
      )}
      <Button type="submit" variant="primary" pending={pending}>
        {pending ? "Checking" : "Continue"}
      </Button>
      <button type="button" className="-my-1 min-h-10 self-start text-sm font-medium text-bw-brand-text underline underline-offset-4 hover:text-bw-text" onClick={() => setBackup(!backup)}>
        {backup ? "Use the authenticator app instead" : "Use a backup code instead"}
      </button>
    </form>
  );
}

export function SetupTwoFactor() {
  const [started, start, starting] = useActionState<SetupState, FormData>(startSetupAction, {});
  const [finished, finish, finishing] = useActionState<SetupState, FormData>(finishSetupAction, {});
  const enrollment = finished.enrollment ?? started.enrollment;
  const setupCode = useRef<HTMLInputElement>(null);
  useFocusOnError(finished.error, finished, setupCode);

  if (enrollment === undefined) {
    return (
      <form action={start} className="flex flex-col gap-4" noValidate>
        <p className="text-sm text-bw-text-muted">
          Every console account needs two-factor sign-in. Enter your password and the enrollment code that came with your reset link.
        </p>
        {started.error ? <InlineAlert kind="error">{started.error}</InlineAlert> : null}
        <Input label="Password" name="password" type="password" autoComplete="current-password" required autoFocus />
        <Input
          label="Enrollment code"
          name="enrollmentCode"
          autoComplete="off"
          spellCheck={false}
          hint="Four groups of four letters and numbers, like ABCD-EFGH-JKLM-NPQR. Ask an admin for a new one if it has expired."
          required
          className="font-mono"
        />
        <Button type="submit" variant="primary" pending={starting}>
          {starting ? "Starting" : "Set up two-factor"}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex list-decimal flex-col gap-4 pl-5 text-sm text-bw-text-muted">
        <li>
          Scan this code with an authenticator app such as 1Password or Google Authenticator.
          <div
            className="mt-3 w-44 rounded-sm border border-bw-border bg-bw-surface p-2 [&_svg]:h-auto [&_svg]:w-full"
            role="img"
            aria-label="QR code for your authenticator app"
            // The SVG comes from the qrcode library on our server, from the otpauth URI.
            dangerouslySetInnerHTML={{ __html: enrollment.qrSvg }}
          />
          <details className="mt-2">
            <summary className="cursor-pointer text-bw-text">Can't scan it? Enter this key instead</summary>
            <code className="mt-2 block break-all rounded-sm bg-bw-surface-sunken p-2 font-mono text-xs text-bw-text">{enrollment.secret}</code>
          </details>
        </li>
        <li>
          Save these backup codes somewhere safe. Each one signs you in once if you lose your phone. They are shown only now.
          <ul className="mt-2 grid grid-cols-2 gap-1 rounded-sm bg-bw-surface-sunken p-3 font-mono text-xs text-bw-text">
            {enrollment.backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </li>
        <li>Enter the six-digit code the app shows.</li>
      </ol>
      <form action={finish} className="flex flex-col gap-4" noValidate>
        {finished.error ? <InlineAlert kind="error">{finished.error}</InlineAlert> : null}
        <Input
          ref={setupCode}
          label="Six-digit code"
          name="code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          autoComplete="one-time-code"
          required
          className="font-mono tracking-[0.3em]"
        />
        <Button type="submit" variant="primary" pending={finishing}>
          {finishing ? "Checking" : "Turn on two-factor"}
        </Button>
      </form>
    </div>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPasswordAction, {});
  if (state.done === true) {
    return (
      <div className="flex flex-col gap-4">
        <InlineAlert kind="success" title="Password set">
          Sign in with your new password. You will set up two-factor next if you have not yet.
        </InlineAlert>
        <Link href="/sign-in" className="text-sm font-medium text-bw-text underline underline-offset-2">
          Go to sign-in
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <InlineAlert kind="error">{state.error}</InlineAlert> : null}
      <input type="hidden" name="token" value={token} />
      <Input label="New password" name="password" type="password" autoComplete="new-password" hint="12 to 128 characters. A long passphrase is best." required autoFocus />
      <Input label="Repeat the new password" name="confirm" type="password" autoComplete="new-password" required />
      <Button type="submit" variant="primary" pending={pending}>
        {pending ? "Saving" : "Set password"}
      </Button>
    </form>
  );
}
