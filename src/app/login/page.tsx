import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import AuthForm from "./AuthForm";

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

  return (
    <main className="mx-auto flex min-h-dvh max-w-app flex-col justify-center px-[18px] py-10">
      <h1 className="display text-[34px] leading-none">Slate</h1>
      <p className="mono mt-2 text-2xs text-bone-dim">one account, every fantasy platform</p>

      {arrival(params.e, params.message) && (
        <p className="mono mt-4 text-2xs leading-relaxed text-bone-dim" role="status">
          {arrival(params.e, params.message)}
        </p>
      )}

      <AuthForm next={next} />
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
