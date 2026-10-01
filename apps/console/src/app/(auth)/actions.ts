"use server";

// Server Actions for sign-in, two-factor, password reset and sign-out. Next checks each action's
// Origin against the host; the flows add the attempt limits and the generic errors (flows.ts).

import { redirect } from "next/navigation";
import QRCode from "qrcode";

import { flowDeps, getConsoleState } from "~/server/auth/console";
import { resetPassword, signIn, signOut, startTotpSetup, verifyCode } from "~/server/auth/flows";

export interface FormState {
  error?: string;
}

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

export async function signInAction(_prev: FormState, form: FormData): Promise<FormState> {
  const res = await signIn({ email: text(form, "email"), password: text(form, "password") }, await flowDeps());
  if (!res.ok) return { error: res.error };
  redirect(res.next === "two-factor" ? "/two-factor" : "/setup-two-factor");
}

export async function verifyCodeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const res = await verifyCode({ code: text(form, "code"), backup: text(form, "backup") === "1" }, await flowDeps());
  if (!res.ok) return { error: res.error };
  redirect("/sets");
}

export interface SetupState extends FormState {
  enrollment?: { qrSvg: string; secret: string; backupCodes: string[] };
}

export async function startSetupAction(_prev: SetupState, form: FormData): Promise<SetupState> {
  const state = await getConsoleState();
  if (state.kind !== "needs-two-factor") redirect(state.kind === "signed-out" ? "/sign-in" : "/sets");
  const res = await startTotpSetup({ password: text(form, "password") }, await flowDeps());
  if (!res.ok) return { error: res.error };
  const uri = res.enrollment.totpURI;
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const secret = new URL(uri).searchParams.get("secret") ?? "";
  return { enrollment: { qrSvg, secret, backupCodes: res.enrollment.backupCodes } };
}

export async function finishSetupAction(prev: SetupState, form: FormData): Promise<SetupState> {
  const res = await verifyCode({ code: text(form, "code") }, await flowDeps());
  // Keep the enrollment on screen so the person can try the next code.
  if (!res.ok) return { ...prev, error: res.error };
  redirect("/sets");
}

export interface ResetState extends FormState {
  done?: boolean;
}

export async function resetPasswordAction(_prev: ResetState, form: FormData): Promise<ResetState> {
  if (text(form, "password") !== text(form, "confirm")) return { error: "The two passwords do not match." };
  const res = await resetPassword({ token: text(form, "token"), password: text(form, "password") }, await flowDeps());
  return res.ok ? { done: true } : { error: res.error };
}

export async function signOutAction(): Promise<void> {
  await signOut(await flowDeps());
  redirect("/sign-in");
}
