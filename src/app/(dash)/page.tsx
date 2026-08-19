import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getDashboard } from "@/lib/dashboard";
import { getPlatformConnectionStatuses } from "@/lib/connector-status";
import { currentUser } from "@/lib/supabase/server";

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
  const user = await currentUser();
  if (!user) redirect("/login");

  const [dashboard, statuses] = await Promise.all([
    getDashboard(user.id, Number.isInteger(requested) ? requested : undefined),
    getPlatformConnectionStatuses(user.id),
  ]);
  const { configured, cards, games, lastSyncedAt, leagueCount, week, weeks } = dashboard;

  const selected = weeks.find((option) => option.week === week);
  const live = cards.some((card) => card.isLive);

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;

  return (
    <DashboardShell
      cards={cards}
      games={games}
      week={week}
      weeks={weeks}
      leagueCount={leagueCount}
      lastSyncedAt={lastSyncedAt}
      statuses={statuses}
      notice={connection}
      identity={{
        firstName: stringOrNull(metadata.first_name),
        lastName: stringOrNull(metadata.last_name),
        email: user.email ?? null,
      }}
      weekState={
        selected && !selected.hasData ? "UNSYNCED" : live ? "SYNCED · LIVE" : "SYNCED"
      }
      emptyMessage={emptyMessage({ configured, leagueCount, hasCards: cards.length > 0, week })}
    />
  );
}

function emptyMessage({
  configured,
  leagueCount,
  hasCards,
  week,
}: {
  configured: boolean;
  leagueCount: number;
  hasCards: boolean;
  week: number | null;
}): string | null {
  if (!configured) return "Supabase isn't configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local.";
  if (leagueCount === 0) {
    return "Connect Sleeper or ESPN and Slate will pull in every league you're in — no provider password ever leaves their site.";
  }
  if (!hasCards) {
    return week
      ? `Week ${week} has not synced yet. Slate fills it in as soon as the platform publishes the matchups.`
      : "Your leagues are connected. Matchups appear once the season starts.";
  }
  return null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
