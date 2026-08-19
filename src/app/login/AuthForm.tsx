"use client";

import { useActionState, useState } from "react";
import { initials } from "@/lib/account";
import { submitAuth, type AuthState } from "./actions";

type Mode = "signin" | "signup" | "reset";

const initial: AuthState = { status: "idle" };

const field =
  "rounded-[4px] border border-ink-line bg-ink-raised px-[14px] py-[13px] text-[calc(15px*var(--ui-scale))] text-bone outline-none focus:border-amber";
const label = "mono text-[calc(10.5px*var(--ui-scale))] tracking-[0.13em] text-bone-dim";

export default function AuthForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [state, action, pending] = useActionState(submitAuth, initial);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");

  // A sent email is the whole panel: nothing else on it is actionable yet.
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
      <div>
        <h2 className="display text-[calc(22px*var(--ui-scale))] tracking-[-0.01em]">
          {resetting ? "Reset password" : creating ? "Create account" : "Sign in"}
        </h2>
        <p className="mt-2 text-[calc(13.5px*var(--ui-scale))] text-bone-dim">
          {resetting ? "Remembered it?" : creating ? "Already have one?" : "No account yet?"}{" "}
          <button
            type="button"
            onClick={() => setMode(creating || resetting ? "signin" : "signup")}
            className="cursor-pointer border-b border-amber/40 text-amber"
          >
            {creating || resetting ? "Sign in" : "Create one"}
          </button>
        </p>
      </div>

      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />

        {creating && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-[10px]">
              <span className={label}>NAME</span>
              <span className="flex items-center gap-2">
                <span className="mono text-[calc(9.5px*var(--ui-scale))] tracking-[0.1em] text-stone">YOUR ICON</span>
                <span
                  className={`mono grid h-[26px] w-[26px] place-items-center rounded-full border border-ink-line bg-ink-raised text-[calc(10px*var(--ui-scale))] ${first || last ? "text-bone" : "text-stone"}`}
                >
                  {first || last ? initials({ firstName: first, lastName: last, email: null }) : "—"}
                </span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-[10px]">
              <input
                name="firstName"
                type="text"
                placeholder="First"
                autoComplete="given-name"
                value={first}
                onChange={(event) => setFirst(event.target.value)}
                className={field}
                aria-label="First name"
              />
              <input
                name="lastName"
                type="text"
                placeholder="Last"
                autoComplete="family-name"
                value={last}
                onChange={(event) => setLast(event.target.value)}
                className={field}
                aria-label="Last name"
              />
            </div>
            <span className="text-[calc(11px*var(--ui-scale))] leading-relaxed text-stone">
              Shown on your account and as your initials in the header. League team names still come
              from each platform.
            </span>
          </div>
        )}

        <label className="flex flex-col gap-2">
          <span className={label}>EMAIL</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@email.com"
            defaultValue={state.status === "error" ? (state.email ?? "") : ""}
            className={field}
          />
        </label>

        {resetting ? (
          <p className="text-xs leading-relaxed text-bone-dim">
            We will email you a link that lets you choose a new password. No password is needed to
            request it.
          </p>
        ) : (
          <label className="flex flex-col gap-2">
            <span className={label}>PASSWORD</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={creating ? "new-password" : "current-password"}
              placeholder="••••••••"
              className={field}
            />
            {creating && (
              <span className="mono text-[calc(10px*var(--ui-scale))] tracking-[0.08em] text-stone">AT LEAST 8 CHARACTERS</span>
            )}
          </label>
        )}

        <p aria-live="polite" className="empty:hidden">
          {state.status === "error" && (
            <span className="mono block text-[calc(10.5px*var(--ui-scale))] leading-relaxed text-flag">{state.message}</span>
          )}
        </p>

        {/* The primary button stays first so Enter never triggers a resend. */}
        <button
          type="submit"
          name="intent"
          value={mode}
          disabled={pending}
          className="mono cursor-pointer rounded-[4px] bg-bone px-4 py-[15px] text-xs tracking-[0.13em] text-ink disabled:cursor-wait disabled:opacity-70"
        >
          {pending
            ? "WORKING…"
            : resetting
              ? "EMAIL A RESET LINK"
              : creating
                ? "CREATE ACCOUNT"
                : "SIGN IN"}
        </button>

        {mode === "signin" && (
          <button
            type="button"
            onClick={() => setMode("reset")}
            className="mono cursor-pointer self-start border-b border-ink-line text-[calc(11.5px*var(--ui-scale))] tracking-[0.06em] text-bone-dim"
          >
            FORGOT PASSWORD?
          </button>
        )}

        {state.status === "error" && state.unconfirmed && (
          <button
            type="submit"
            name="intent"
            value="resend"
            disabled={pending}
            className="mono cursor-pointer rounded-[4px] border border-amber px-4 py-3 text-xs tracking-[0.06em] text-bone disabled:cursor-wait"
          >
            {pending ? "SENDING…" : "RESEND CONFIRMATION EMAIL"}
          </button>
        )}

        {creating && (
          <p className="text-xs leading-relaxed text-bone-dim">
            Creating an account sends a confirmation link to your email. Your account is not usable
            until you open that link.
          </p>
        )}
      </form>

      <p className="border-t border-ink-line pt-5 text-[calc(11.5px*var(--ui-scale))] leading-relaxed text-stone">
        Slate never receives or stores your Sleeper, ESPN, or Yahoo password. This password is handled
        by Supabase only for your Slate account.
      </p>
    </>
  );
}

function CheckEmail({ email, next, resent }: { email: string; next: string; resent: boolean }) {
  const [state, action, pending] = useActionState(submitAuth, initial);
  const sentAgain = resent || state.status === "resent";

  return (
    <section className="flex flex-col gap-3" aria-live="polite">
      <div className="flex flex-col gap-[10px] rounded-[4px] border border-amber bg-ink-raised px-[18px] py-[18px]">
        <span className="mono flex items-center gap-2 text-[calc(11px*var(--ui-scale))] tracking-[0.11em] text-bone">
          <i className="h-[5px] w-[5px] rounded-full bg-amber" aria-hidden />
          {sentAgain ? "CONFIRMATION EMAIL SENT AGAIN" : "CONFIRMATION EMAIL SENT"}
        </span>
        <p className="text-[calc(13.5px*var(--ui-scale))] leading-relaxed text-bone-dim">
          We emailed a confirmation link to <span className="text-bone">{email}</span>. Open it to
          finish creating your Slate account, then come back and sign in.
        </p>
        <p className="text-[calc(11.5px*var(--ui-scale))] leading-relaxed text-stone">
          Nothing in your inbox? Check spam — the message comes from Supabase.
        </p>
      </div>

      {state.status === "error" && (
        <p className="mono text-[calc(10.5px*var(--ui-scale))] leading-relaxed text-flag">{state.message}</p>
      )}

      <form action={action} className="grid gap-2">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="intent" value="resend" />
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          disabled={pending}
          className="mono cursor-pointer rounded-[4px] border border-ink-line bg-ink-raised px-4 py-[14px] text-[calc(11.5px*var(--ui-scale))] tracking-[0.08em] text-bone disabled:cursor-wait"
        >
          {pending ? "SENDING…" : "RESEND CONFIRMATION EMAIL"}
        </button>
      </form>

      <a
        href={`/login?next=${encodeURIComponent(next)}`}
        className="mono rounded-[4px] border border-ink-line px-4 py-[14px] text-center text-[calc(11.5px*var(--ui-scale))] tracking-[0.08em] text-bone-dim"
      >
        BACK TO SIGN IN
      </a>
    </section>
  );
}

function ResetSent({ email, next }: { email: string; next: string }) {
  return (
    <section className="flex flex-col gap-4" aria-live="polite">
      <div className="flex flex-col gap-[10px] rounded-[4px] border border-amber bg-ink-raised px-[18px] py-[18px]">
        <span className="mono text-[calc(11px*var(--ui-scale))] tracking-[0.11em] text-bone">RESET LINK SENT</span>
        <p className="text-[calc(13.5px*var(--ui-scale))] leading-relaxed text-bone-dim">
          If <span className="text-bone">{email}</span> has a Slate account, a password reset link is
          on its way. Open it to choose a new password.
        </p>
        <p className="text-[calc(11.5px*var(--ui-scale))] leading-relaxed text-stone">
          Nothing in your inbox? Check spam — the message comes from Supabase.
        </p>
      </div>

      <a
        href={`/login?next=${encodeURIComponent(next)}`}
        className="mono rounded-[4px] border border-ink-line px-4 py-[14px] text-center text-[calc(11.5px*var(--ui-scale))] tracking-[0.08em] text-bone-dim"
      >
        BACK TO SIGN IN
      </a>
    </section>
  );
}
