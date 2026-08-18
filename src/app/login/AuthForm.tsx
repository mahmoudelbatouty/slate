"use client";

import { useActionState, useState } from "react";
import { submitAuth, type AuthState } from "./actions";

type Mode = "signin" | "signup" | "reset";

const initial: AuthState = { status: "idle" };

const field =
  "mono mt-2 w-full border border-ink-line bg-ink-raised px-3 py-3 text-base text-bone outline-none";
const label = "mono block text-2xs tracking-[0.16em] text-bone-dim";

export default function AuthForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [state, action, pending] = useActionState(submitAuth, initial);

  // A sent email is the whole screen: nothing else on it is actionable yet.
  if (state.status === "check-email" || state.status === "resent") {
    return <CheckEmail email={state.email} next={next} resent={state.status === "resent"} />;
  }
  if (state.status === "reset-sent") {
    return <ResetSent email={state.email} next={next} />;
  }

  const creating = mode === "signup";
  const resetting = mode === "reset";

  return (
    <>
      <div className="mt-7 grid grid-cols-2 gap-2" role="tablist" aria-label="Account">
        <Tab selected={!creating} onSelect={() => setMode("signin")}>
          SIGN IN
        </Tab>
        <Tab selected={creating} onSelect={() => setMode("signup")}>
          CREATE ACCOUNT
        </Tab>
      </div>

      <form action={action} className="mt-6">
        <input type="hidden" name="next" value={next} />

        <label htmlFor="email" className={label}>
          EMAIL
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          defaultValue={state.status === "error" ? (state.email ?? "") : ""}
          className={field}
        />

        {resetting ? (
          <p className="mt-4 text-xs leading-relaxed text-bone-dim">
            We will email you a link that lets you choose a new password. No password is needed to
            request it.
          </p>
        ) : (
          <>
            <label htmlFor="password" className={`${label} mt-4`}>
              PASSWORD
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={creating ? "new-password" : "current-password"}
              aria-describedby={creating ? "password-hint" : undefined}
              className={field}
            />
            {creating && (
              <p id="password-hint" className="mono mt-2 text-2xs text-bone-dim">
                AT LEAST 8 CHARACTERS
              </p>
            )}
          </>
        )}

        <p aria-live="polite" className="empty:hidden">
          {state.status === "error" && (
            <span className="mono mt-4 block text-2xs leading-relaxed text-flag">
              {state.message}
            </span>
          )}
        </p>

        {/* The primary button stays first so Enter never triggers a resend. */}
        <button
          type="submit"
          name="intent"
          value={mode}
          disabled={pending}
          className="mono mt-4 w-full cursor-pointer border border-ink-line bg-ink-raised px-4 py-3 text-xs tracking-[0.06em] text-bone disabled:cursor-wait disabled:text-bone-dim"
        >
          {pending ? "WORKING…" : resetting ? "EMAIL A RESET LINK" : creating ? "CREATE ACCOUNT" : "SIGN IN"}
        </button>

        {mode === "signin" && (
          <button
            type="button"
            onClick={() => setMode("reset")}
            className="mono mt-3 cursor-pointer text-2xs tracking-[0.06em] text-bone-dim underline underline-offset-4"
          >
            FORGOT PASSWORD?
          </button>
        )}

        {resetting && (
          <button
            type="button"
            onClick={() => setMode("signin")}
            className="mono mt-3 cursor-pointer text-2xs tracking-[0.06em] text-bone-dim underline underline-offset-4"
          >
            BACK TO SIGN IN
          </button>
        )}

        {state.status === "error" && state.unconfirmed && (
          <button
            type="submit"
            name="intent"
            value="resend"
            disabled={pending}
            className="mono mt-2 w-full cursor-pointer border border-amber bg-ink px-4 py-3 text-xs tracking-[0.06em] text-bone disabled:cursor-wait"
          >
            {pending ? "SENDING…" : "RESEND CONFIRMATION EMAIL"}
          </button>
        )}

        {creating && (
          <p className="mt-4 text-xs leading-relaxed text-bone-dim">
            Creating an account sends a confirmation link to your email. Your account is not usable
            until you open that link.
          </p>
        )}

        <p className="mt-6 border-t border-ink-line pt-4 text-xs leading-relaxed text-bone-dim">
          Slate never receives or stores your Sleeper, ESPN, or Yahoo password. This password is
          handled by Supabase only for your Slate account.
        </p>
      </form>
    </>
  );
}

function Tab({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`mono cursor-pointer border px-4 py-3 text-xs tracking-[0.06em] ${
        selected
          ? "border-bone-dim bg-ink-raised text-bone"
          : "border-ink-line bg-ink text-bone-dim"
      }`}
    >
      {children}
    </button>
  );
}

function CheckEmail({ email, next, resent }: { email: string; next: string; resent: boolean }) {
  const [state, action, pending] = useActionState(submitAuth, initial);
  const sentAgain = resent || state.status === "resent";

  return (
    <section className="mt-7" aria-live="polite">
      <div className="border border-amber bg-ink-raised px-4 py-4">
        <p className="mono text-xs tracking-[0.08em] text-bone">
          {sentAgain ? "CONFIRMATION EMAIL SENT AGAIN" : "CONFIRMATION EMAIL SENT"}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-bone-dim">
          We emailed a confirmation link to <span className="text-bone">{email}</span>. Open it to
          finish creating your Slate account, then come back and sign in.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-bone-dim">
          Nothing in your inbox? Check spam — the message comes from Supabase.
        </p>
      </div>

      {state.status === "error" && (
        <p className="mono mt-3 text-2xs leading-relaxed text-flag" aria-live="polite">
          {state.message}
        </p>
      )}

      <form action={action} className="mt-4 grid gap-2">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="intent" value="resend" />
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          disabled={pending}
          className="mono cursor-pointer border border-ink-line bg-ink-raised px-4 py-3 text-xs tracking-[0.06em] text-bone disabled:cursor-wait disabled:text-bone-dim"
        >
          {pending ? "SENDING…" : "RESEND CONFIRMATION EMAIL"}
        </button>
      </form>

      <a
        href={`/login?next=${encodeURIComponent(next)}`}
        className="mono mt-2 block border border-ink-line bg-ink px-4 py-3 text-center text-xs tracking-[0.06em] text-bone-dim"
      >
        BACK TO SIGN IN
      </a>
    </section>
  );
}

function ResetSent({ email, next }: { email: string; next: string }) {
  return (
    <section className="mt-7" aria-live="polite">
      <div className="border border-amber bg-ink-raised px-4 py-4">
        <p className="mono text-xs tracking-[0.08em] text-bone">RESET LINK SENT</p>
        <p className="mt-2 text-sm leading-relaxed text-bone-dim">
          If <span className="text-bone">{email}</span> has a Slate account, a password reset link is
          on its way. Open it to choose a new password.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-bone-dim">
          Nothing in your inbox? Check spam — the message comes from Supabase.
        </p>
      </div>

      <a
        href={`/login?next=${encodeURIComponent(next)}`}
        className="mono mt-4 block border border-ink-line bg-ink px-4 py-3 text-center text-xs tracking-[0.06em] text-bone-dim"
      >
        BACK TO SIGN IN
      </a>
    </section>
  );
}
