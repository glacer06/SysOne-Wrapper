"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  LIMITS,
  buildBody,
  readResponse,
  retryAfterText,
  validate,
  type EarlyAccessFields,
  type FieldErrors,
} from "~/lib/early-access";
import { earlyAccessEndpoint, kitUrl } from "~/site";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "invalid"; message: string }
  | { kind: "rate_limited"; retryAfterSeconds: number | null }
  | { kind: "failed" };

const EMPTY: EarlyAccessFields = { email: "", name: "", company: "", role: "", useCase: "", website: "" };

export function EarlyAccessForm() {
  const id = useId();
  const [fields, setFields] = useState<EarlyAccessFields>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const mountedAt = useRef<number | null>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedAt.current = performance.now();
  }, []);

  useEffect(() => {
    if (status.kind === "success") successHeading.current?.focus();
    if (status.kind === "invalid" || status.kind === "rate_limited" || status.kind === "failed") alertRef.current?.focus();
  }, [status.kind]);

  const set = (key: keyof EarlyAccessFields) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setFields((f) => ({ ...f, [key]: value }));
    if (key !== "website" && errors[key] !== undefined) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.kind === "submitting") return;
    const found = validate(fields);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = (["email", "name", "company", "role", "useCase"] as const).find((k) => found[k] !== undefined);
      if (first) document.getElementById(`${id}-${first}`)?.focus();
      return;
    }
    setStatus({ kind: "submitting" });
    const elapsed = mountedAt.current === null ? 0 : performance.now() - mountedAt.current;
    const body = buildBody(fields, window.location.pathname, elapsed);
    try {
      const res = await fetch(earlyAccessEndpoint, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setStatus(await readResponse(res));
    } catch {
      setStatus({ kind: "failed" });
    }
  }

  if (status.kind === "success") {
    return (
      <div className="form-success" role="status">
        <h3 ref={successHeading} tabIndex={-1}>
          Thanks. If this is a new address, we will be in touch.
        </h3>
        <p>
          Early access opens to design partners first. In the meantime the <a href={kitUrl}>free kit</a> works today and
          does not need an account.
        </p>
      </div>
    );
  }

  const submitting = status.kind === "submitting";
  const describe = (key: keyof FieldErrors, hint?: string) =>
    [errors[key] !== undefined ? `${id}-${key}-error` : null, hint].filter(Boolean).join(" ") || undefined;
  const fieldError = (key: keyof FieldErrors) =>
    errors[key] !== undefined ? (
      <p id={`${id}-${key}-error`} className="field-error">
        {errors[key]}
      </p>
    ) : null;

  return (
    <form className="form" noValidate onSubmit={onSubmit} aria-describedby={`${id}-note`}>
      {status.kind === "invalid" || status.kind === "rate_limited" || status.kind === "failed" ? (
        <div className="form-alert" role="alert" tabIndex={-1} ref={alertRef}>
          {status.kind === "invalid" ? (
            <>
              <strong>We could not accept that.</strong>
              {status.message}
            </>
          ) : status.kind === "rate_limited" ? (
            <>
              <strong>Too many requests from your network.</strong>
              {retryAfterText(status.retryAfterSeconds)}
            </>
          ) : (
            <>
              <strong>That did not go through.</strong>
              We could not reach the server, or it had a problem. Your answers are still here, so try again in a moment.
            </>
          )}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor={`${id}-email`}>Work email</label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          className="input"
          autoComplete="email"
          inputMode="email"
          required
          aria-required="true"
          maxLength={LIMITS.email}
          aria-invalid={errors.email !== undefined}
          aria-describedby={describe("email")}
          value={fields.email}
          onChange={set("email")}
        />
        {fieldError("email")}
      </div>

      <div className="form-row">
        <div className="field">
          <label htmlFor={`${id}-name`}>
            Name <span className="optional">(optional)</span>
          </label>
          <input
            id={`${id}-name`}
            name="name"
            className="input"
            autoComplete="name"
            maxLength={LIMITS.name}
            aria-invalid={errors.name !== undefined}
            aria-describedby={describe("name")}
            value={fields.name}
            onChange={set("name")}
          />
          {fieldError("name")}
        </div>
        <div className="field">
          <label htmlFor={`${id}-company`}>
            Company <span className="optional">(optional)</span>
          </label>
          <input
            id={`${id}-company`}
            name="company"
            className="input"
            autoComplete="organization"
            maxLength={LIMITS.company}
            aria-invalid={errors.company !== undefined}
            aria-describedby={describe("company")}
            value={fields.company}
            onChange={set("company")}
          />
          {fieldError("company")}
        </div>
      </div>

      <div className="field">
        <label htmlFor={`${id}-role`}>
          Role <span className="optional">(optional)</span>
        </label>
        <input
          id={`${id}-role`}
          name="role"
          className="input"
          autoComplete="organization-title"
          maxLength={LIMITS.role}
          aria-invalid={errors.role !== undefined}
          aria-describedby={describe("role")}
          value={fields.role}
          onChange={set("role")}
        />
        {fieldError("role")}
      </div>

      <div className="field">
        <label htmlFor={`${id}-useCase`}>
          What would you like to decide with it? <span className="optional">(optional)</span>
        </label>
        <textarea
          id={`${id}-useCase`}
          name="useCase"
          className="textarea"
          maxLength={LIMITS.useCase}
          aria-invalid={errors.useCase !== undefined}
          aria-describedby={describe("useCase", `${id}-useCase-hint`)}
          value={fields.useCase}
          onChange={set("useCase")}
        />
        <p id={`${id}-useCase-hint`} className="hint">
          For example: which pull requests can merge without review, or which support emails need a reply today.
        </p>
        {fieldError("useCase")}
      </div>

      <div className="honeypot" aria-hidden="true">
        <label htmlFor={`${id}-website`}>Website</label>
        <input
          id={`${id}-website`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={fields.website}
          onChange={set("website")}
        />
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-stack" disabled={submitting} aria-disabled={submitting}>
          <span aria-hidden={submitting}>Request early access</span>
          <span aria-hidden={!submitting}>Sending</span>
        </button>
        <span className="visually-hidden" role="status">
          {submitting ? "Sending your request" : ""}
        </span>
      </div>

      <p id={`${id}-note`} className="form-note">
        We use what you enter here only to contact you about early access, and we never sell it. Read the{" "}
        <Link href="/privacy">privacy notice</Link> for what we keep and how to have it deleted.
      </p>
    </form>
  );
}
