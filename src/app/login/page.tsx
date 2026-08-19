import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import AuthForm from "./AuthForm";
import { SignInBoard } from "./SignInBoard";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; next?: string; message?: string }>;
}) {
  const params = await searchParams;
  const user = await currentUser().catch(() => null);
  if (user) redirect("/");

  const requested = params.next ?? "/";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
  const message = arrival(params.e, params.message);

  return (
    <main className="grid min-h-dvh w-full max-w-[1280px] grid-cols-1 signin:grid-cols-[minmax(0,1fr)_560px]">
      <SignInBoard />

      <section className="flex flex-col justify-center gap-6 border-ink-line bg-deep px-[18px] py-12 signin:border-l signin:px-12">
        <div className="mx-auto flex w-full max-w-[440px] flex-col gap-6">
          {message && (
            <p className="mono text-[calc(10.5px*var(--ui-scale))] leading-relaxed tracking-[0.08em] text-bone-dim" role="status">
              {message}
            </p>
          )}
          <AuthForm next={next} />
        </div>
      </section>
    </main>
  );
}

/** Messages that come from a redirect, not from submitting this form. */
function arrival(e?: string, message?: string): string | undefined {
  if (e === "unconfigured") return "Supabase Auth is not configured on the server.";
  if (e === "recovery-expired") return "That password reset link has expired. Request a new one below.";
  if (e === "confirmation") return "That confirmation link is invalid or expired. Sign in, or create the account again to get a fresh link.";
  if (message === "signed-out") return "You are signed out. Your fantasy data is hidden, not deleted.";
  return undefined;
}
