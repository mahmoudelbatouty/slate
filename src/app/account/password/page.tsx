import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import PasswordForm from "./PasswordForm";

export const dynamic = "force-dynamic";

export default async function NewPassword() {
  // Reached through a recovery link, which signs the user in before landing here.
  const user = await currentUser().catch(() => null);
  if (!user) redirect("/login?e=recovery-expired");

  return (
    <main className="mx-auto flex min-h-dvh max-w-app flex-col justify-center px-[18px] py-10">
      <h1 className="display text-[calc(34px*var(--ui-scale))] leading-none">Slate</h1>
      <p className="mono mt-2 text-2xs text-bone-dim">choose a new password</p>
      <p className="mt-4 text-sm leading-relaxed text-bone-dim">
        Signed in as <span className="text-bone">{user.email}</span> from your reset link.
      </p>
      <PasswordForm />
    </main>
  );
}
