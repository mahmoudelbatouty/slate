import { getDashboard } from "@/lib/dashboard";
import { SortableLeagueCards } from "@/components/SortableLeagueCards";
import { SyncedAt } from "@/components/SyncedAt";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Today, TodayContext } from "@/components/Today";
import { WeekPicker } from "@/components/WeekPicker";
import { ConnectorStatus } from "@/components/ConnectorStatus";
import { LiveRefresh } from "@/components/LiveRefresh";
import Link from "next/link";
import { getPlatformConnectionStatuses } from "@/lib/connector-status";

// Reads Postgres on every request. The data is already local, so there's
// nothing to cache around — and a stale score is worse than a query.
export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; connection?: string }>;
}) {
  const { week: raw, connection } = await searchParams;
  const requested = Number(raw);

  const [dashboard, connector] = await Promise.all([
    getDashboard(Number.isInteger(requested) ? requested : undefined),
    getPlatformConnectionStatuses(),
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
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <Today week={week} />
          <ConnectorStatus statuses={connector} notice={connection} />
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <SyncedAt iso={lastSyncedAt} leagueCount={leagueCount} />
            <LiveRefresh enabled={configured && leagueCount > 0} />
          </div>
          <div className="flex min-h-7 shrink-0 items-center gap-2">
            <TodayContext context={weekContext} />
            <ThemeToggle />
          </div>
        </div>
        <WeekPicker weeks={weeks} selected={week} />
      </header>

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
        <SortableLeagueCards cards={cards} />
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
