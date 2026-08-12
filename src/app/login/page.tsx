export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; next?: string }>;
}) {
  const { e, next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-app flex-col justify-center px-[18px]">
      <h1 className="display text-[34px] leading-none">Slate</h1>
      <p className="mono mt-2 text-2xs text-bone-dim">
        {e === "unset"
          ? "APP_PASSWORD is not set on the server."
          : "one screen, three platforms"}
      </p>

      <form action="/api/auth/login" method="post" className="mt-7">
        <input type="hidden" name="next" value={next ?? "/"} />
        <label htmlFor="password" className="mono block text-2xs tracking-[0.16em] text-bone-dim">
          PASSWORD
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          className="mono mt-2 w-full border border-ink-line bg-ink-raised px-3 py-3 text-base text-bone outline-none"
        />
        {e === "1" && (
          <p className="mono mt-2 text-2xs text-flag">Wrong password.</p>
        )}
        <button
          type="submit"
          className="mono mt-4 w-full cursor-pointer border border-ink-line bg-ink-raised px-4 py-3 text-xs tracking-[0.06em] text-bone"
        >
          ENTER
        </button>
      </form>
    </main>
  );
}
