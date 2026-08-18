"use client";

import { useActionState } from "react";
import { updatePassword, type PasswordState } from "./actions";

const initial: PasswordState = { status: "idle" };

const field =
  "mono mt-2 w-full border border-ink-line bg-ink-raised px-3 py-3 text-base text-bone outline-none";
const label = "mono block text-2xs tracking-[0.16em] text-bone-dim";

export default function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);

  return (
    <form action={action} className="mt-7">
      <label htmlFor="password" className={label}>
        NEW PASSWORD
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        minLength={8}
        autoFocus
        autoComplete="new-password"
        aria-describedby="password-hint"
        className={field}
      />
      <p id="password-hint" className="mono mt-2 text-2xs text-bone-dim">
        AT LEAST 8 CHARACTERS
      </p>

      <label htmlFor="confirm" className={`${label} mt-4`}>
        CONFIRM NEW PASSWORD
      </label>
      <input
        id="confirm"
        name="confirm"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        className={field}
      />

      <p aria-live="polite" className="empty:hidden">
        {state.status === "error" && (
          <span className="mono mt-4 block text-2xs leading-relaxed text-flag">{state.message}</span>
        )}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="mono mt-4 w-full cursor-pointer border border-ink-line bg-ink-raised px-4 py-3 text-xs tracking-[0.06em] text-bone disabled:cursor-wait disabled:text-bone-dim"
      >
        {pending ? "SAVING\u2026" : "SET PASSWORD"}
      </button>
    </form>
  );
}
