import { getDashboard } from "@/lib/dashboard";
import { LeagueCard } from "@/components/LeagueCard";
import { SyncedAt } from "@/components/SyncedAt";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Today } from "@/components/Today";
import { WeekPicker } from "@/components/WeekPicker";
import { LeftToPlay } from "@/components/LeftToPlay";
import { ConnectorStatus } from "@/components/ConnectorStatus";
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
  const { configured, cards, lastSyncedAt, leagueCount, week, weeks, spine } = dashboard;

  const isCurrent = weeks.find((w) => w.week === week)?.isCurrent ?? true;

  return (
    <main className="mx-auto max-w-app px-[18px] pb-16">
      <header className="sticky top-0 z-10 border-b border-ink-line bg-ink pt-[22px] pb-[14px]">
        <Today week={week} isCurrent={isCurrent} />
        <div className="flex items-center justify-between gap-3">
          <SyncedAt iso={lastSyncedAt} leagueCount={leagueCount} />
          <ThemeToggle />
        </div>
        <WeekPicker weeks={weeks} selected={week} />
      </header>

      <ConnectorStatus status={connector} />

      {configured && <LeftToPlay spine={spine} />}

      {!configured ? (
        <Empty>
          Supabase isn&apos;t configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local.
        </Empty>
      ) : cards.length === 0 ? (
        <Empty>
          {leagueCount === 0
            ? "No leagues yet. Add your Sleeper username in Connections, then run a sync."
            : isCurrent
              ? "No matchups for this week yet. Run a live sync."
              : `Week ${week} hasn't been synced. Run \`npm run sync -- backfill\`.`}
        </Empty>
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

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-10 border border-ink-line bg-ink-raised px-4 py-5 text-sm text-bone-dim">
      {children}
    </p>
  );
}
