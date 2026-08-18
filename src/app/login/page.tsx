import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { login, signup } from "./actions";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; next?: string; message?: string }>;
}) {
  const [params, user] = await Promise.all([searchParams, currentUser()]);
  if (user) redirect("/");
  const { e, next, message } = params;

  return (
    <main className="mx-auto flex min-h-dvh max-w-app flex-col justify-center px-[18px]">
      <h1 className="display text-[34px] leading-none">Slate</h1>
      <p className="mono mt-2 text-2xs text-bone-dim">
        {e === "unconfigured"
          ? "Supabase Auth is not configured on the server."
          : "one account, every fantasy platform"}
      </p>

      {message === "check-email" && (
        <aside className="mt-6 border border-amber bg-ink-raised px-4 py-4" role="status">
          <p className="mono text-xs tracking-[0.08em] text-bone">ACCOUNT CREATED</p>
          <p className="mt-2 text-sm leading-relaxed text-bone-dim">
            Check your email and click the Supabase confirmation link. Then return here and log in.
          </p>
        </aside>
      )}

      <form className="mt-7">
        <input type="hidden" name="next" value={next ?? "/"} />
        <label htmlFor="email" className="mono block text-2xs tracking-[0.16em] text-bone-dim">
          EMAIL
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          className="mono mt-2 w-full border border-ink-line bg-ink-raised px-3 py-3 text-base text-bone outline-none"
        />
        <label htmlFor="password" className="mono mt-4 block text-2xs tracking-[0.16em] text-bone-dim">
          PASSWORD
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          className="mono mt-2 w-full border border-ink-line bg-ink-raised px-3 py-3 text-base text-bone outline-none"
        />
        {e && <p className="mono mt-2 text-2xs text-flag">{authMessage(e)}</p>}
        {message && message !== "check-email" && (
          <p className="mono mt-2 text-2xs text-bone-dim">{statusMessage(message)}</p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button formAction={login} className="mono cursor-pointer border border-ink-line bg-ink-raised px-4 py-3 text-xs tracking-[0.06em] text-bone">
            LOG IN
          </button>
          <button formAction={signup} className="mono cursor-pointer border border-ink-line bg-ink px-4 py-3 text-xs tracking-[0.06em] text-bone-dim">
            CREATE ACCOUNT
          </button>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-bone-dim">
          Slate never receives or stores your Sleeper or ESPN password. This password is handled by Supabase only for your Slate account.
        </p>
      </form>
    </main>
  );
}

function authMessage(code: string) {
  if (code === "invalid") return "Email or password is incorrect.";
  if (code === "confirm-email") return "Your account exists, but you must confirm it from the email Supabase sent before logging in.";
  if (code === "signup") return "The account could not be created. Try another email or a longer password.";
  if (code === "confirmation") return "That confirmation link is invalid or expired.";
  return "Authentication is unavailable right now.";
}

function statusMessage(code: string) {
  if (code === "check-email") return "Check your email to confirm your Slate account.";
  if (code === "signed-out") return "You are signed out. Your fantasy data is hidden, not deleted.";
  return "";
}
