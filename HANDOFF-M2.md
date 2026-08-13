# Handoff — M2: the "Left to play" spine

> Historical handoff: M2 is complete. For current work, read `HANDOFF-M3.md`.
> The repo owner has approved automatic provider connections, inline matchup
> expansion, and carefully confirmed lineup writes, superseding this file's
> older read-only/session guidance.

You're picking up Slate after M0 and M1. Read `CLAUDE.md` and `DESIGN.md`
first — they are the brief and they win any argument with this document.
This file covers what's already true, what M2 needs, and the things that
already cost someone an hour so they don't cost you one.

---

## Where the project actually is

**M0 and M1 are done and pushed.** `main` builds clean, lints clean, 49
tests pass.

| Thing | State |
|---|---|
| Next.js 16 / React 19 / Tailwind v4 / TS strict | wired |
| Supabase project `slate` (`qqxceojybbacughapnom`, us-east-1) | created, `0001_init` applied |
| `src/db/types.gen.ts` | generated from the live schema |
| Password gate | works, verified in a browser |
| Sleeper adapter | works against real data — 10 leagues, 3 in-season |
| Sync orchestrator (`players`/`daily`/`live`/`backfill`) | written, **not yet run against Postgres** |
| Dashboard | renders; shows the empty state because the DB is empty |
| Week filter | built, unit-tested, **not yet seen with real data** |

### The one blocker

`.env.local` has no `SUPABASE_SERVICE_ROLE_KEY`. Nothing server-side can
read or write until the repo owner pastes it in (Supabase dashboard →
Project Settings → API keys). **Don't try to work around this** — don't
swap in the anon key, don't disable the check. Ask for the key.

Once it's set, fill the database in this order:

```bash
npm run sync -- players
```

```bash
npm run sync -- daily
```

```bash
npm run sync -- backfill
```

`players` builds the ~11k-row directory and the crosswalk; `daily` pulls
leagues/teams/rosters/transactions; `backfill` writes matchups for weeks
1..current. Order matters on a cold database.

Note it is **August 2026 and preseason** — Sleeper reports week 1 and
every score is 0. Seven of the ten leagues are `pre_draft`. You will not
see interesting numbers until the season starts, which makes fixtures and
unit tests your only real feedback loop. Plan accordingly.

---

## The four rules you cannot break

These are from `CLAUDE.md`. They are not style preferences.

1. **The UI never calls a platform API.** Page loads read Postgres and
   nothing else. Sync jobs are the only code that touches Sleeper. If M2
   makes you want to fetch game state during a render, you've taken a
   wrong turn — sync it into a table and read that.
2. **Read-only. Forever.** No writes to any platform, no server actions,
   no scaffolding "for later," no disabled Swap button. The entire action
   surface is the deep link on each card.
3. **Color encodes game state and nothing else.** Not platform, not team.
   Amber means *live* and is rationed — `DESIGN.md` says if more than
   ~10% of the screen is amber, something is wrong. Platform is the mono
   monogram (`SL`/`ES`/`YH`).
4. **No `any`.** Zod-validate at the adapter boundary. Canonical DTOs
   only — nothing platform-shaped escapes `src/adapters/`.

---

## What M2 is

From `DESIGN.md`: a horizontal band across the top of the dashboard
showing today's game windows, with a dot per starter **across all
leagues**, positioned in the window their real-life game falls in.

```
  LEFT TO PLAY                                    9 of 27 remaining
  ┌────────────┬────────────┬────────────┬────────────┐
  │   1:00     │   4:05     │   4:25     │   8:20     │
  │ ●●●●●●●●●● │ ●●●●●      │ ●●●●       │ ●          │
  │ ○○○        │ ○○         │            │            │
  └────────────┴────────────┴────────────┴────────────┘
    ● played      ◐ live      ○ yet to play
```

Played dots go `stone`, in-progress `amber`, not-yet-played stay `bone`.
Everything else on the page stays quiet so this lands.

**Three things fall out of the same data**, and you should do all three:

1. The spine itself.
2. A real **win probability** (see below — this is why it was deferred).
3. Fixing **`is_final`**, which is currently a hack.

---

## The key discovery: Sleeper's `scores` endpoint

This is the thing that makes M2 possible, and it took some digging.

Sleeper has an undocumented GraphQL endpoint at **`https://sleeper.com/graphql`**.
It's an Elixir/Absinthe schema, so **introspection uses snake_case** —
`query_type` not `queryType`, `of_type` not `ofType`. That trips up every
standard GraphQL client.

`scores` **works unauthenticated** and returns real NFL game state:

```graphql
{
  scores(sport: "nfl", season: "2025", season_type: "regular", week: 11) {
    game_id
    status
    start_time
    metadata
  }
}
```

Verified: returns 15 games for a week. `metadata` is a `Json` blob
containing what you need:

```json
{
  "game_key": "202511101",
  "day": "2025-11-16",
  "quarter": "F",
  "is_over": true,
  "is_in_progress": false,
  "canceled": false,
  "possession": "",
  "down": "",
  "away_team": "SF",
  "home_score_quarter4": 12
}
```

`start_time` gives you the window (1:00 / 4:05 / 4:25 / 8:20 ET),
`is_over` / `is_in_progress` / `quarter` give you dot color, and the same
fields give you a truthful `is_final`.

### Treat it as unstable

Same posture as the projections host that `sleeper.ts` already uses, and
`CLAUDE.md` is explicit about this: validate with Zod at the boundary,
degrade to an empty result on failure, write the failure to `sync_runs`,
and **never let a missing game state break a score sync**. If `scores`
returns nothing, the spine should render empty and the cards should still
show points.

### What NOT to do

`matchup_legs` on the same schema has tempting fields — `proj_points`
(Sleeper's own team projection), `max_points`, and `starters_games`
(per-starter game state, which would hand you M2 on a plate). **It returns
`Unauthorized`.**

Do not pursue it. Getting it requires storing a Sleeper session token,
which destroys the one good property Sleeper has in this project —
`CLAUDE.md`: *"Sleeper: username only. Nothing to expire."* It would turn
the most reliable platform into a third credential that silently rotates
and needs a reconnect banner. The repo owner was asked and this was the
agreed answer.

Also settled, so you don't re-investigate: **Sleeper exposes no win
probability anywhere.** All 152 types in the GraphQL schema were swept;
the only probability-shaped fields are `UserDerbyPrize.winner_count`,
`LeagueDuesPaymentMethod.fee_percentage`, `RootQueryType.my_winnings`,
`RosterStanding.wins`, `LeagueDuesPayoutConfig.review_window_hours` — all
unrelated. The percentage in Sleeper's app is computed client-side. Yahoo
and ESPN are unverified and are M3/M4's problem.

---

## Suggested shape for M2

Not prescriptive — but this is the path the existing code is bent toward.

### 1. Migration `0002_nfl_games.sql`

You need somewhere to put game state, because the UI can't fetch it.
Something like:

```sql
create table nfl_games (
  game_id      text primary key,
  season       int not null,
  week         int not null,
  season_type  text not null,
  start_time   timestamptz,
  status       text,
  home_team    text,
  away_team    text,
  is_over      boolean not null default false,
  in_progress  boolean not null default false,
  quarter      text,
  raw          jsonb,            -- keep the blob, per the raw-payload convention
  updated_at   timestamptz not null default now()
);
create index on nfl_games (season, week);
create index on nfl_games (start_time);
```

Apply it, then regenerate types (`npm run types`, or via the Supabase
MCP if you have it).

### 2. Adapter surface

`getPlayerDirectory` is already the odd one out on `PlatformAdapter` —
it's Sleeper-only and optional. Game state is the same shape of problem
(one source serves every league and every platform), so consider an
optional `getGameState?(sport, season, week)` on the contract rather than
bolting it onto the Sleeper adapter privately. ESPN and Yahoo leagues
still need their players' games, and they'll read from the same table.

Put the GraphQL call in `src/adapters/sleeper/scores.ts` or similar. Zod
the response. Return canonical DTOs.

### 3. Sync

Add game state to the `live` path (it changes every few minutes) and to
`backfill`. `src/sync/run.ts` already has the containment pattern — a
throw becomes an `error` row in `sync_runs` and other platforms still run.
Follow it.

### 4. Joining players to games

`players.team_abbr` → `nfl_games.home_team`/`away_team`. Watch for:

- **Defenses.** Sleeper's DEF "players" have the team abbreviation as
  their id. They map to a game like anyone else, but check the position
  handling.
- **Bye weeks.** A starter whose team has no game that week has no dot.
  Decide whether that's invisible or a distinct state — a bye starter is
  arguably worth *seeing*, since it's a lineup mistake.
- **Abbreviation drift.** Sleeper and the scores payload should agree
  (same vendor), but assert it in a test rather than assuming.

### 5. Win probability

Now computable, and this is why it was deliberately left out of M1:

```
projected final = current points + projections for starters who haven't played
margin ~ Normal(projected margin, σ)
win prob = Φ(projected margin / σ)
```

The whole thing lives or dies on σ shrinking as games complete. Down 12
with your roster intact is a coin flip; down 12 in the fourth quarter of
the last game is over. A fixed σ is confidently wrong all afternoon, which
is worse than showing nothing.

The card currently shows the **margin** instead (`up 15.5`, `won by 36.6`)
via `marginLabel` in `LeagueCard.tsx`, and the hairline bar shows share of
combined score — **not** a win probability, despite what the mock in
`DESIGN.md` shows. Replace both when you have a model you trust. If you
don't get there, leave the margin; do not ship a made-up percentage.

### 6. The spine component

Server component reading Postgres. It aggregates across **all** leagues,
so it needs starters from `roster_entries` (where `is_starter`) joined to
`players` joined to `nfl_games`. One query, rendered once, above the cards.

Windows are derived from `start_time` clustered into the standard ET
slots. Don't hardcode four columns — international games and Saturday
slates exist. Derive the columns from the distinct start times present.

---

## File map

```
src/
  adapters/
    types.ts          PlatformAdapter contract + canonical DTOs (provided, near-untouched)
    sleeper.ts        the reference adapter; read this before writing any other
  sync/
    run.ts            orchestrator: modes, upserts, sync_runs logging, containment
    crosswalk.ts      4-tier player ID matching, pure + unit tested
    slots.ts          resolves Sleeper's positional S0/S1/... into QB/RB/FLEX
  db/
    client.ts         service-role Supabase client, server-only
    types.gen.ts      generated — regenerate after any migration
  lib/
    matchup.ts        pure: MatchupCard shape, byDrama, deepLink, resolveWeek
    dashboard.ts      the Postgres read; server-only
    auth.ts           hashed-cookie password gate
    useClock.ts       useSyncExternalStore clock (see gotchas)
  components/         LeagueCard, WeekPicker, Today, SyncedAt, ThemeToggle
  proxy.ts            the password gate (Next 16 renamed middleware -> proxy)
scripts/
  smoke.ts            hits Sleeper, prints leagues; works with no DB
  sync.ts             CLI wrapper around runSync
  record-fixtures.ts  re-record fixtures/sleeper/ (extend this for scores)
fixtures/sleeper/     recorded once; every test runs against these
supabase/migrations/  0001_init.sql
```

---

## Gotchas that already cost time

- **Tailwind v4:** color tokens must live in `@theme` or the utilities
  (`bg-ink`, `text-bone-dim`) are never generated. The `[data-theme]`
  blocks below it re-point the same variables so both schemes swap. Don't
  "tidy" the colors back into `:root`.
- **Next 16:** it's `src/proxy.ts` exporting `proxy()`, not
  `middleware.ts`. The old convention warns loudly.
- **ESLint `react-hooks/set-state-in-effect` is an error, not a warning.**
  `setState` in an effect body fails the build. Use `useSyncExternalStore`
  — `useClock.ts` and `ThemeToggle.tsx` are the worked examples. Note
  `getSnapshot` must return a *stable* value between real changes, which
  is why the clock is bucketed into 30s intervals rather than returning
  `Date.now()`.
- **Supabase upserts need a natural key.** `players` has only a uuid
  default, so `onConflict: "id"` with no id supplied inserts fresh rows
  every run. `syncPlayers` mints UUIDs explicitly and uses `player_ids` as
  the identity map. Don't undo that.
- **Insert order is not a contract.** Never zip returned rows against
  input order to build a mapping.
- **`vitest.config.mts`**, not `.ts` — the package is CommonJS and a `.ts`
  config warns on every run.
- **Zod v4** is installed; `z.record` takes two args.
- **Windows/PowerShell** is the dev environment. `&&` is not a valid
  chain operator there; the Bash tool is available for POSIX syntax.
- **`.env*` is gitignored.** Never commit secrets. The repo is public.

---

## Definition of done for M2

Open the app on a phone on a Sunday afternoon and see, above the league
cards, how many of your starters across all leagues have played, how many
are on the field right now, and how many are still to come — and be able
to tell from that whether a matchup you're losing is actually lost.

Tests: every new pure function unit tested, the `scores` response recorded
into `fixtures/` and the parser tested against it. **No test hits a live
API.** Run `npm test`, `npm run lint`, and `npm run build` before you call
it done.
