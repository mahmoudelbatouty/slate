# Slate

One dashboard for fantasy leagues spread across Sleeper, ESPN, and Yahoo.

**Single user for the current prototype.** This runs for the repo owner today.
Do not build general multi-tenancy until the provider-connection and write
flows are proven. Auth is a single hardcoded password or a Supabase magic link
to one allowlisted email.

---

## Why this exists

Three leagues on three platforms means three apps, three logins, and no way to
see Sunday as one picture. The hub answers one question fast: **across every
league I'm in, how am I doing right now, and what haven't I done yet?**

Everything else is secondary. If a feature doesn't serve that question, cut it.

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict | Server Components by default |
| DB | Supabase Postgres | schema in `supabase/migrations/` |
| Styling | Tailwind CSS v4 | tokens from `DESIGN.md`, no arbitrary hex in components |
| Deploy | Vercel | Hobby tier is fine |
| Scheduling | Vercel Cron | see sync cadence below |
| Testing | Vitest | adapters tested against recorded fixtures, never live APIs |

No ORM. Use `supabase-js` with typed queries generated via
`supabase gen types typescript`.

---

## Architecture (non-negotiable)

```
  Sleeper API ─┐
  Yahoo API ───┼─→ adapters/ ─→ normalizers/ ─→ Supabase ─→ UI
  ESPN API ────┘   (per platform)  (canonical)    (cache)   (reads DB only)
```

**The UI never calls a platform API.** Page loads read Postgres and nothing
else. Sync jobs are the only code that touches Sleeper/ESPN/Yahoo. This is what
keeps the app fast and keeps it standing when ESPN changes something.

Consequences to respect:
- Every page is fast and works offline-ish. No loading spinners on platform data.
- A broken platform degrades to stale data with a "last synced 14m ago" label,
  not an error page.
- Writes (Yahoo only) go through a server action that calls Yahoo, then
  immediately re-syncs that one league so the UI reflects reality.

### Repo layout

```
src/
  app/
    (dash)/page.tsx           # today across all leagues — the main screen
    (dash)/league/[id]/page.tsx
    (dash)/team/[id]/page.tsx
    admin/unmatched/page.tsx  # crosswalk failures, manual mapping
    admin/connections/page.tsx# OAuth and browser-connector status
    api/cron/sync/route.ts
  adapters/
    types.ts                  # PlatformAdapter contract — provided
    sleeper.ts
    yahoo.ts
    espn.ts
  sync/
    run.ts                    # orchestrator: loop adapters, upsert, log
    crosswalk.ts              # player ID matching
  db/
    client.ts
    types.gen.ts
  components/
supabase/
  migrations/0001_init.sql    # provided schema
fixtures/                     # recorded API responses for tests
```

---

## Scope: unified read/write hub

The approved direction is an all-in-one hub. Users should be able to inspect a
complete matchup and, where the provider permits it, adjust their lineup from
Slate without navigating away.

Writes are deliberately narrower than reads:

- **Yahoo:** use its documented OAuth authorization flow and request Fantasy
  Read/Write access. Prefer the official API for lineup changes.
- **Sleeper and ESPN:** no supported third-party Fantasy write API is known.
  Writes may use the local browser connector only as an explicitly labeled
  experimental capability. Never collect a password, cookie, or session token.
- Every write requires an exact preview, an explicit final confirmation, an
  idempotency key, an audit record, and a provider read-back before Slate claims
  success. No optimistic success state.
- The extension may implement only allowlisted operations with validated
  request/response shapes. It must not become a generic authenticated request
  proxy or arbitrary script runner.
- A platform write failure must leave the other platforms and the read-only
  dashboard working.

Deep links remain as a fallback when a write is unsupported, the connector is
offline, or provider verification fails.

Deep link patterns:
- Sleeper: `https://sleeper.com/leagues/{league_id}/team`
- ESPN: `https://fantasy.espn.com/football/team?leagueId={id}&teamId={teamId}&seasonId={season}`
- Yahoo: `https://football.fantasysports.yahoo.com/f1/{league_id}/{team_id}`

## Full-league visibility

The hub shows **every matchup in every league**, not just yours. This is a
core requirement, not a stretch goal — half the point of Sunday is watching the
game that decides your playoff seed.

Costs one API call per league per week on each platform:
- Sleeper `/league/{id}/matchups/{week}` — all rosters, plus `players_points`
  for player-level scoring on every team.
- ESPN `?view=mMatchup` — full week scoreboard; add `mBoxscore` for players.
- Yahoo `/league/{key}/scoreboard;week={n}` — all matchups. Player-level
  requires a per-team roster call, so batch with
  `/teams;team_keys={a},{b},...` rather than looping.

The `matchups` table already stores one row per team per week for all teams.
Default the dashboard to your own matchups; a "whole league" toggle on each
card expands to the full scoreboard inline. **No navigation** — it expands in
place, because the data is already loaded.

Deep link patterns:
- Sleeper: `https://sleeper.com/leagues/{league_id}/team`
- ESPN: `https://fantasy.espn.com/football/team?leagueId={id}&teamId={teamId}&seasonId={season}`
- Yahoo: `https://football.fantasysports.yahoo.com/f1/{league_id}/{team_id}`

---

## Credentials

Store in `platform_accounts`, secrets in the `secrets` jsonb column. Client
IDs/secrets live in env vars, never in the DB.

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
YAHOO_CLIENT_ID=
YAHOO_CLIENT_SECRET=
YAHOO_REDIRECT_URI=
SLEEPER_USERNAME=
CRON_SECRET=
APP_PASSWORD=
```

- **Sleeper**: username only. Nothing to expire.
- **Yahoo**: one-time OAuth consent at `/admin/connections`. Store the refresh
  token; mint access tokens on demand (1hr life). Refresh tokens are long-lived
  but not eternal — surface a reconnect banner when `last_ok_at` goes stale.
- **ESPN**: browser connector. The user signs into ESPN directly; Slate never
  receives the password, cookies, or session token. Surface a reconnect banner
  when approved captures stop arriving.

### Browser connector

For private data that a provider does not expose through a supported API,
prefer the local browser connector over collecting passwords or copying
cookies. The user signs into the provider directly. The extension may observe
only explicitly allowlisted fantasy response bodies and must never read
password fields, cookies, local storage, request headers, or platform tokens.

The extension authenticates to Slate with a random ingest-only token. Store
only its SHA-256 hash, make it revocable, validate and sanitize every payload at
the server boundary, and keep connector tables inaccessible to `anon` and
`authenticated`. Native projections live separately from the scheduled sync
cache so a routine sync cannot overwrite them.

The production UX must not ask the user to copy that token. Pairing is a
short-lived, one-time handshake initiated from **Connect Sleeper** or **Connect
ESPN**. The raw connector token is delivered directly to the installed
extension and is never rendered in the page. The old copy/paste token UI has
been removed; future platform connections must use the same short-lived,
single-use challenge pattern.

---

## Sync cadence

Daily maintenance uses the cron route. Live scoring is demand-driven while an
authenticated dashboard is open so the prototype remains compatible with
Vercel Hobby's once-per-day cron limit.

| Mode | Schedule | Does |
|---|---|---|
| `live` | browser checks every 30s; provider pull at most once/minute during a scheduled/in-progress NFL game | matchups + scores only |
| `daily` | 06:00 ET | leagues, teams, rosters, transactions, standings |
| `players` | 04:00 ET | Sleeper player directory + crosswalk rebuild |

Guard the cron route with `CRON_SECRET`; the live route stays behind the app's
password gate and rejects cross-origin POSTs. Every provider run writes a
`sync_runs` row — success or failure. The live route uses recent score runs as
a database-backed cooldown and also coalesces same-instance requests, so
multiple tabs do not normally multiply provider traffic. Batch by league and
cache the player dump for 24h (it's several MB, never fetch it per-request).

The live-refresh and inline-matchup surfaces are canonical and cross-platform.
ESPN and Yahoo adapters must populate the same tables and types so they inherit
the same cadence, weekly status model, full lineup display, and automatic UI
refresh without provider-specific dashboard branches.

---

## Build order

Ship each milestone working before starting the next.

- **M0 — skeleton.** Next.js + Supabase wired, migration applied, types
  generated, password gate, empty dashboard shell using the design tokens.
- **M1 — Sleeper end to end.** Adapter, sync job, player crosswalk, dashboard
  rendering one real league's live matchup. *This is the proof the whole
  architecture works.* No auth complexity to fight while you validate it.
- **M2 — matchup-level "Left to play."** Compact weekly you-vs-opponent
  remaining counts on each card; detailed player state belongs in the inline
  matchup rather than a global field of starter dots (see `DESIGN.md`).
- **M3 — Connections + complete matchup.** Automatic connector pairing,
  always-visible week selection, expandable player-level matchups, and Yahoo
  OAuth with Fantasy Read/Write access.
- **M4 — Lineup actions.** Official Yahoo lineup edits, followed by explicitly
  experimental Sleeper/ESPN connector actions with confirmation and read-back.
- **M5 — full-league expansion.** Whole-league scoreboard toggle on every card,
  player-level breakdowns, league standings view.

---

## Platform gotchas

**Sleeper** — `https://api.sleeper.app/v1`. GET only, no auth.
`/user/{username}` → `user_id` → `/user/{user_id}/leagues/nfl/{season}`.
`isMine` is `roster.owner_id === your user_id`. Player dump at `/players/nfl` is
large: fetch once daily, cache, never call it from a request path.

*Projections are on a different host* — `https://api.sleeper.com/projections/nfl/{season}/{week}`,
undocumented but publicly readable. It returns Sleeper's projected stat line.
Apply the complete `league.scoring_settings` map as a dot product, exactly as
Sleeper's web client does; never substitute the generic `pts_ppr`,
`pts_half_ppr`, or `pts_std` convenience fields. Sum unrounded player values
before rounding the team total. One weekly call still serves every league.
Treat the host as unstable: on failure return an empty map and render
projections as "—". A missing projection must never fail a score sync.

**Yahoo** — `https://fantasysports.yahooapis.com/fantasy/v2`. Always append
`?format=json`. The JSON is XML translated literally: numeric string keys,
`count` fields, arrays that are sometimes objects. Write one
`flattenYahoo()` helper in `adapters/yahoo/flatten.ts`, test it hard against
fixtures, then never think about it again. Keys look like `nfl.l.123456` and
`nfl.l.123456.t.4`. **Attribution is required**: render "Fantasy data provided
by Yahoo Fantasy" linking to Yahoo on any screen showing Yahoo data.

**ESPN** — `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{id}`.
The browser connector accesses the signed-in session locally; Slate never
stores `espn_s2` or `SWID`. Data is selected with stackable `?view=` params:
`mTeam`, `mRoster`, `mMatchup`, `mSettings`, `mTransactions2`. Undocumented and
unversioned — treat every response as untrusted, validate with Zod at the
adapter boundary, and let a failure write to `sync_runs` and return empty rather
than throw.

---

## Conventions

- Adapters return canonical DTOs only. Platform-shaped objects never escape
  `src/adapters/`.
- Every adapter response is validated with Zod before normalization.
- Keep raw payloads: `leagues.scoring_raw` and `roster_entries.external_player_id`
  are populated even when normalization succeeds. When a platform changes a
  field name mid-season you re-derive from the raw blob instead of re-fetching
  history you may no longer have.
- Tests run against `fixtures/`, recorded once. No test hits a live API.
- Times stored UTC, rendered in the user's local zone.
- No `any`. No client-side data fetching from platform APIs.
- Enabled platforms use official, accessible Sleeper, ESPN, and Yahoo marks in
  the shared card/header logo component. Monograms are failure fallbacks only,
  and brand colors never encode game state.

## Definition of done for v1

Open the app on a phone on Sunday at 1pm and see, without navigating anywhere,
every league's live matchup, whether you're up or down, which of your starters
haven't played yet, and — one tap to expand — every other matchup in each
league. Acting on any of it is one deep link away.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
