import { getDashboard } from "@/lib/dashboard";
import { LeagueCard } from "@/components/LeagueCard";
import { SyncedAt } from "@/components/SyncedAt";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Today } from "@/components/Today";
import { WeekPicker } from "@/components/WeekPicker";
import { ConnectorStatus } from "@/components/ConnectorStatus";
import Link from "next/link";
import { getConnectorStatus } from "@/lib/connector-status";

// Reads Postgres on every request. The data is already local, so there's
// nothing to cache around — and a stale score is worse than a query.
export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week: raw } = await searchParams;
  const requested = Number(raw);

  const [dashboard, connector] = await Promise.all([
    getDashboard(Number.isInteger(requested) ? requested : undefined),
    getConnectorStatus(),
  ]);
  const { configured, cards, lastSyncedAt, leagueCount, week, weeks } = dashboard;

  const currentWeek = weeks.find((option) => option.isCurrent)?.week ?? null;
  const isCurrent = week === currentWeek;
  const weekContext = week === null
    ? "preseason"
    : isCurrent
      ? "current"
      : currentWeek !== null && week < currentWeek
        ? "past"
        : "upcoming";
  const selectedWeek = weeks.find((option) => option.week === week);
  const isUnsynced = Boolean(selectedWeek && !selectedWeek.hasData);

  return (
    <main className="mx-auto max-w-app px-[18px] pb-16">
      <header className="sticky top-0 z-10 border-b border-ink-line bg-ink pt-[22px] pb-[14px]">
        <Today week={week} context={weekContext} />
        <div className="flex items-center justify-between gap-3">
          <SyncedAt iso={lastSyncedAt} leagueCount={leagueCount} />
          <ThemeToggle />
        </div>
        <WeekPicker weeks={weeks} selected={week} />
      </header>

      <ConnectorStatus status={connector} />

      {configured && isUnsynced && week && (
        <UnsyncedWeek week={week} isCurrent={isCurrent} />
      )}

      {!configured ? (
        <Empty>
          Supabase isn&apos;t configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local.
        </Empty>
      ) : cards.length === 0 ? (
        isUnsynced ? null : (
          <Empty>
            {leagueCount === 0
              ? "No leagues yet. Add your Sleeper username in Connections, then run a sync."
              : "No matchup data is available for this selection yet."}
          </Empty>
        )
      ) : (
        <section className="mt-[22px] flex flex-col gap-3">
          {cards.map((card) => (
            <LeagueCard key={card.leagueId} card={card} />
          ))}
        </section>
      )}
    </main>
  );
}

function UnsyncedWeek({ week, isCurrent }: { week: number; isCurrent: boolean }) {
  return (
    <aside
      className="mt-4 border border-ink-line bg-ink-raised px-4 py-4"
      aria-live="polite"
    >
      <p className="mono text-2xs tracking-[0.08em] text-bone">WEEK {week} · UNSYNCED</p>
      <p className="mt-1 text-xs leading-relaxed text-bone-dim">
        {isCurrent
          ? "Slate is syncing this matchup automatically. Scores and projections will appear as the platform publishes them."
          : `Slate syncs Week ${week} automatically. Its matchup will appear when the platform publishes the schedule; scores and projections can arrive later.`}
      </p>
      {!isCurrent && (
        <Link
          className="mt-3 inline-block border-b border-ink-line pb-0.5 text-xs text-bone"
          href="/"
        >
          Return to current week
        </Link>
      )}
    </aside>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-10 border border-ink-line bg-ink-raised px-4 py-5 text-sm text-bone-dim">
      {children}
    </p>
  );
}
