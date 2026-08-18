# Handoff — M3/M4: seamless connections, complete matchups, lineup actions

## Morning pickup — authoritative state as of 2026-08-18

This section supersedes conflicting historical notes later in this file.

### Session decisions — 2026-08-18, later same day

**Login rewrite merged.** PR #12, squashed to `2987ba6`. Sign-in and sign-up are
separate modes, the confirmation email is announced before and after signup, and
password reset exists at `/account/password`. See the section below for detail.

**Sleeper lineup write is parked, not abandoned.** Branch
`codex/sleeper-write-recorder` is open and deliberately unmerged. It contains a
working opt-in recorder plus the reverse-engineered write, and these findings
should not be re-derived:

- The write is `update_matchup_leg` on `https://sleeper.com/graphql`, sent by
  XHR. Every argument except `starters_games` is inlined into the query string;
  `variables` is `{}`.
- `starters` is positional. A swap replaces one index and leaves all others
  identical. Empty slots are `"0"` and defenses use team abbreviations, so
  player IDs are not always numeric.
- Sleeper's own save also resends `roster_update_taxi` with unchanged values.
  That is a UI no-op and Slate must not reproduce it.
- The response returns the server's stored `starters`, which is the read-back
  signal. GraphQL reports failure inside a 200, so the error array is checked
  first and a 2xx is never success.
- `src/connector/sleeper-write.ts` builds the request from strictly validated
  arguments and verifies the response. Nothing is wired to the UI or extension.
- No WebSocket is involved; HTTP interception suffices.

**Product direction under revision: the extension must not be required.** The
owner's goal is personal use now, scaling to all users later, with no extension
install. Analysis, not yet implemented:

- **Sleeper** needs no OAuth and no extension for reads. Its API is public and
  unauthenticated; a username input replaces connector pairing entirely.
- **ESPN** has no OAuth. Private leagues have no supported extension-free path.
  Publicly viewable leagues work server-side. The plan is to support public
  leagues and state the private-league limit in the UI.
- **Yahoo** is the only platform that can be a complete hub — reads and writes,
  on a phone, nothing installed.
- **Writes at scale are Yahoo-only.** Sleeper and ESPN writes need a signed-in
  session that cannot exist server-side; other users get deep links.
- The extension is therefore demoted to an optional desktop power feature for
  private ESPN leagues and the owner's own Sleeper writes.

`CLAUDE.md` has **not** been updated for this yet. It still says no username
entry is required and treats connector pairing as the canonical Sleeper path.
Reconcile the brief before building toward either model.

**Open question the owner intends to revisit: storing provider session tokens
and cookies.** Deferred, not decided. What the analysis established:

- A provider *password* is never required for any read or write path being
  considered, and storing one is strictly worse than every alternative. That
  rule should not move.
- Server-side ESPN or Sleeper access without an extension requires a stored
  session token or cookie. `token-crypto.ts` already provides AES-256-GCM with
  an env-held key, which protects at rest but not against application
  compromise, since the app must decrypt to use it.
- Such a credential cannot be scoped, cannot be revoked without a password
  change, and lives a long time — unlike an OAuth grant.
- Client-side-only encryption does not work: ESPN cookies are `HttpOnly` and a
  cross-origin call is blocked by CORS. That is the whole architectural reason
  the extension exists.
- Acceptable-risk judgment differs sharply between the single operator and
  other users, where a table of session cookies is a breach liability.

**Yahoo** application is written and ready but not submitted; the owner will
revisit when access is approved. It remains the gate on all scalable writes.

**Vercel** project `slate` created and linked to the GitHub repo
(`prj_7ybmdWGks3gGAh4JMRqC2zqBySal`, team `MTE`). The first deployment was
refused because the authenticated Vercel identity lacks permission to create
production deployments for that team. Environment variables are not yet set.

### Sign-in screen — rebuilt 2026-08-18 (after the M6 merge)

`/login` no longer mixes sign-in and sign-up in one ambiguous two-button form.

- The screen has an explicit two-tab mode switch: **SIGN IN** / **CREATE
  ACCOUNT**. One primary button, labeled for the selected mode. The typed email
  survives a mode switch because switching is local state, not navigation.
- Creating an account states *before* submission that a confirmation link will
  be emailed and that the account does not work until that link is opened.
- After signup the whole screen becomes a confirmation panel naming the exact
  address the link went to, with a spam-folder note and a **resend** button.
- Signing in to an unconfirmed account no longer dead-ends: the error offers an
  inline resend.
- **Forgot password?** sends a Supabase recovery link. Its outcome message is
  deliberately identical for known and unknown addresses, so the screen never
  discloses whether an account exists. `/account/password` accepts the new
  password after the recovery link signs the user in; `auth/confirm` forces
  `type=recovery` to that page regardless of the requested `next`.
- Errors render inline through `useActionState`, not as `?e=` query codes, and
  no email address is ever placed in a URL. Only redirect-borne notices
  (`signed-out`, `unconfigured`, `confirmation`, `recovery-expired`) still use
  query params.
- Validation lives in `src/lib/auth-form.ts` and is unit tested; `?next=` is
  still restricted to same-origin paths.
- Verified locally against the real Supabase project: mode switch, signup copy,
  reset request round trip, wrong-password error with email preserved, and the
  signed-out redirect from `/account/password`. 152 tests, ESLint, TypeScript,
  and the production build all pass.

Before deploy, add the production origin to Supabase Auth's **Site URL** and
**Redirect URLs** allowlist. Confirmation and recovery links are built from the
request `origin`, so a missing allowlist entry silently sends users to
localhost.

### Repository and verification

- PR #11 (`codex/m6-espn-connector`) was merged into `main` on 2026-08-18
  at merge commit `b0b723a`.
- Latest implementation commit in that PR: `a8be7b6`; its final handoff commit
  was `fbfe966`.
- Final local verification: 145 tests pass, ESLint passes, TypeScript passes,
  the production Next.js build passes, and the working tree contains no secrets.
- Begin the next task from updated `main`; the remote feature branch was deleted
  after merge and must not be reused.

### User/account behavior now implemented

- Slate uses Supabase email/password Auth. Signed-out users see no fantasy
  records. Every league, platform account, sync run, projection override, and
  connector installation is scoped to its authenticated owner.
- A newly created Slate account starts empty. Legacy prototype rows remain
  unowned and cannot be claimed merely by signing up or signing in.
- Sleeper and ESPN connection begins from the compact provider marks in Slate.
  The connector claims a short-lived account-scoped challenge, navigates the
  originating Slate tab to the provider, and navigates that same tab back only
  after Slate confirms successful ingestion. No second tab is normally opened.
- Users sign in only on the provider's page. Slate never accepts or stores a
  Sleeper/ESPN password, session token, cookie, email, or request header.
- Connector version is `0.6.1`. An unpacked installation must be reloaded from
  `chrome://extensions` after pulling connector changes.

### Sleeper connection and refresh

- Sleeper has no official OAuth flow. After normal provider sign-in, the page
  bridge reads only Sleeper's non-secret numeric `localStorage.user_id`. It is
  strictly digits-only; `token`, `email`, passwords, cookies, headers, and all
  other storage keys are neither read nor transmitted.
- The server binds that numeric ID to the current Slate owner and runs an
  owner-scoped account sync through Sleeper's public read API. Users do not type
  a username and do not open individual matchups.
- Initial/account sync imports all leagues, teams, rosters, provider-published
  matchup weeks, scores, current points, and Sleeper-derived projections.
  Dashboard live refresh remains owner-scoped and cannot coalesce work across
  two users.
- Sleeper's NFL preseason counter must not become fantasy Week 2/3. For drafted
  leagues, `season_type = pre` maps to fantasy Week 1 so published Week 1 and
  future matchups remain visible. Slate exposes no separate PRE/preseason tab.
  Truly undrafted leagues remain canonical `pre_draft` cards.
- Live verification on 2026-08-18: Sleeper returned and Slate stored all 10
  leagues for the connected owner (4 drafted/in-season, 6 pre-draft), 116
  teams, 1,489 roster entries, and 714 matchup rows spanning published Weeks
  1–17. A transient first database fetch failure succeeded on the single safe,
  idempotent retry; no rows were deleted or reassigned.

### ESPN connection and refresh

- ESPN uses the same password-free pairing/return UX but reads approved fantasy
  responses through the signed-in Chromium session. The connector stores at
  most ten sanitized numeric league/team/season references locally and uses
  Chromium alarms for background refresh: approximately five minutes idle and
  one minute in a live NFL window. Chromium and the ESPN login session must
  remain active; an ESPN tab does not need to remain open after discovery.
- ESPN payloads are sanitized in the extension and validated again by the
  server before canonical ingestion. Raw provider responses and browser auth
  material never enter Slate.
- Fresh-refresh verification on 2026-08-18: a new owner-scoped ESPN installation
  was created, two league snapshots were captured from ESPN, received by Slate
  about 0.1 seconds later, and the canonical ESPN leagues received the same new
  capture timestamp. The quick result came from an already signed-in ESPN
  browser session, not from displaying an old connection.

### Read-only boundary and later writes

- Sleeper and ESPN are read-only in this milestone. A public Sleeper user ID
  grants no write capability.
- Sleeper/ESPN lineup changes remain a later experimental milestone because no
  supported third-party Fantasy write API is available. They require an active
  signed-in provider tab, an explicit user-confirmed command, stale-lineup and
  lock checks, idempotency, provider submission, and provider read-back before
  Slate may display success. Never automate or imply a lineup write from login.
- Yahoo is still deferred to the final provider milestone. Use official Yahoo
  OAuth and request reviewed Fantasy Read/Write access; never collect Yahoo
  credentials. Existing scaffolding must remain owner-scoped.

### Recommended next work

1. Pull updated `main` and read this authoritative section before changing the
   connector or account ownership model.
2. Deploy to Vercel and configure production Supabase/Yahoo callback values only
   through environment settings; never commit secret values.
3. Revalidate account A/account B isolation in the deployed environment.
4. Test ESPN background refresh after Chromium has been idle and after its
   provider session expires; surface a clear reconnect state.
5. Keep Yahoo until the final provider milestone. Before any write feature,
   complete the provider-specific confirmation/read-back workflow described
   below.

## 2026-08-18 — Supabase Auth ownership foundation

- Replaced `APP_PASSWORD` with Supabase email/password Auth and SSR sessions.
- Signed-out dashboard and protected connector routes redirect to `/login`.
- Added owner-scoped records, indexes, uniqueness, RLS, and connector pairing.
- Sign-out hides cached fantasy data without deleting it.
- Every account starts empty and sees only records created by its own platform
  connections. Legacy prototype records remain unowned and are never claimed
  automatically by login, signup, confirmation, or dashboard rendering.
- Build, lint, 145 tests, and signed-out browser checks pass.

The owner-scope audit is complete for dashboard reads, connector ingestion,
live sync, Sleeper refresh, and Yahoo scaffolding. Revalidate it after deploy.

This file records the repo owner's approved product-direction change on
2026-08-12. `CLAUDE.md` and `DESIGN.md` have been updated to match it. If older
handoffs say Slate is permanently read-only, this handoff and the current brief
supersede them.

## Outcome

Slate remains the one browser screen used during fantasy game day. A user can:

1. Connect each platform without copying credentials or connector keys.
2. Move between every fantasy week using an always-visible selector.
3. Expand any matchup inline and inspect both complete lineups.
4. Adjust a lineup inside Slate when the provider supports it, with explicit
   confirmation and provider verification.

## What already exists

- Branch `codex/browser-connector`, PR #2.
- Sleeper browser connector reads the allowlisted authenticated
  `matchup_legs` response and imports native `proj_points`.
- Connector tokens are random, hashed in Postgres, revocable, and authorized
  only for `/api/connector/ingest`.
- Native projections are durable overrides and survive `npm run sync -- live`.
- Connector/canonical Supabase tables are closed to `anon` and `authenticated`.
- `WeekPicker` exists but returns `null` when `weeks.length <= 1`; this is why
  the filter is currently invisible.
- Matchup cards still show summary rows and a provider deep link only.
- Supabase migrations through `20260813005306_native_projection_overrides.sql`
  are already applied to project `qqxceojybbacughapnom`.

## M3 progress

- Automatic Sleeper pairing is implemented on `codex/m3-auto-pairing`.
- Pairing challenges expire after five minutes, are single-use, and are
  consumed atomically by a server-role-only Postgres function.
- The dashboard never renders the claim secret or ingest token. The extension
  stores the ingest token locally and opens Sleeper for normal provider login.
- A provider is shown as connected only after a validated capture exists.
- The manual connector-token input has been removed from the extension popup.
- The always-visible full-season week selector is implemented on
  `codex/m3-week-selector`. It remains server-rendered and shareable through
  `?week=N`, supports provider season-end metadata, and labels
  current/synced/unsynced states without relying on color.
- Daily sync now imports every provider-published season matchup, including
  future pairings. Users never need to open individual provider matchups to
  populate Slate; private/native fields may arrive separately when published.
- Complete inline matchup views are implemented on `codex/m3-inline-matchups`:
  both starters and collapsible benches, weekly you/opponent status, current
  points, projections, injury/lock state, NFL opponent/game state, and provider
  sync time render without leaving Slate. The shared platform mark is reused
  in both card states and the layout is verified at 360px.
- Sleeper player projections use Sleeper's own weekly projected stat lines
  scored through the league's complete `scoring_settings`. This matches the
  value shown by Sleeper, including custom categories and bonuses; generic
  PPR/half-PPR/standard totals must not be used as a shortcut.
- Every expanded player row states the selected-week game state explicitly:
  `PLAYED`, `LIVE`, `TO PLAY`, `BYE / TBD`, or `CANCELED`. This comes from the
  provider game feed and is not inferred from the current calendar day.
- Provider lineup order is stored canonically on `roster_entries`. Sleeper
  starter rows preserve empty-slot gaps and bench rows carry native current
  points/projections; IR and taxi players remain stored but do not masquerade
  as bench players. Apply this same canonical order field to Yahoo and ESPN.
- Dashboard matchup cards have a visible drag handle with pointer and keyboard
  reordering. The preference uses `platform:externalLeagueId`, persists across
  reloads and selected weeks, and preserves temporarily hidden leagues. Future
  ESPN/Yahoo cards must enter this same shared sortable list automatically. A
  pointer drag previews the intended destination and commits exactly once on
  release; cards must not reorder continuously beneath the pointer or require a
  second press to keep the saved position.
- Routine provider deep-link buttons were removed once inline inspection
  existed. The expanded lineup is a two-column head-to-head comparison at all
  widths so the user never has to remember a roster shown further up-screen.
- The Yahoo read adapter now covers leagues, teams, weekly rosters, matchup
  scores, and Yahoo projections. OAuth uses state + S256 PKCE, refresh tokens
  are encrypted and rotation-aware, access tokens remain transient, and the
  callback triggers a Yahoo-only canonical sync. A real-account verification
  still requires Yahoo developer credentials in the deployment environment.
- The dashboard live endpoint now discovers connected Sleeper/Yahoo leagues
  and refreshes each due provider through the shared sync pipeline. Cooldown
  leases are provider-specific, so one recent provider pull cannot hide stale
  data from another. ESPN must join this same allowlist when its read adapter
  lands; do not add a provider-specific browser timer.
- Sleeper cards use the official monochrome Sleeper wordmark instead of `SL`.
- Pre-draft leagues now render as cards even before a matchup exists. This is
  driven by canonical league status, so ESPN and Yahoo receive the same
  behavior when their adapters are enabled.

### Platform logo requirement for the next slices

- Add the current official ESPN and Yahoo marks when those adapters are
  enabled, using the same neutral treatment as the Sleeper wordmark.
- Keep approved assets local or use a narrowly allowlisted official CDN. Never
  render arbitrary provider-supplied asset URLs.
- Give every mark an accessible platform name and a fixed-size container that
  stays legible at 360px without shifting or truncating the league title.
- Prefer monochrome/high-contrast variants where the platform permits them.
  Brand color identifies the provider but must never encode game state.
- `ES` and `YH` are loading/error fallbacks only. The completed enabled-
  platform UI should show official Sleeper, ESPN, and Yahoo marks consistently.

## Non-negotiable security boundary

- Never accept or store a Sleeper/ESPN/Yahoo password.
- Never read or transmit cookies, session tokens, request headers, passwords,
  email, or arbitrary local storage from Sleeper/ESPN connector sessions. The
  sole local-storage exception is Sleeper's public numeric `user_id`, with a
  digits-only schema and no access to any other key.
- Do not expose the Supabase service-role key or connector tokens to Git.
- The extension is an allowlisted fantasy-data adapter, not an HTTP proxy.
- Unknown operation names, fields, providers, league IDs, and response shapes
  fail closed.
- Every write is preview → explicit confirmation → provider submission →
  read-back verification → audit result.
- Never display success merely because a request returned 2xx.
- Platform failure degrades to stale/read-only data and cannot break Slate.

## Recommended implementation order

### 1. Automatic connector pairing

Replace the visible token in `ConnectorStatus.tsx` and the paste fields in the
extension popup.

Use a short-lived, single-use pairing challenge:

1. User selects **Connect Sleeper** or **Connect ESPN** in Slate.
2. Slate creates a challenge tied to the authenticated Slate session, intended
   platform, dashboard origin, expiration (≤5 minutes), and random nonce.
3. The installed extension claims the challenge through the active Slate tab
   and exchanges it for an ingest token. The user never sees either secret.
4. Slate stores only the token hash. Mark the challenge consumed atomically.
5. The extension opens/focuses the provider login page. The user signs in
   directly with the provider.
6. A validated capture marks that platform connected.

Do not put a long-lived token in a query string, DOM attribute, page text,
analytics event, browser history, console log, or error message. Keep the
copy/paste path only behind an explicit development flag until automatic
pairing is verified, then delete it.

Suggested new tables: `connector_pairing_challenges` and provider-level status
on installations. Both server-only with RLS enabled and no public policies.

### 2. Always-visible week selector

Current blocker: `src/components/WeekPicker.tsx` hides itself for ≤1 week and
`getDashboard()` builds options only through `currentWeek`.

- Build the full selectable range for the fantasy season (normally weeks
  1–18; incorporate league playoff/settings metadata where available).
- Always render the control.
- Keep `?week=N` shareable and server-rendered.
- Current, selected, available, and unsynced must be distinguishable without
  relying on color alone.
- Selecting an unsynced week shows specific empty copy and offers/initiates a
  backfill where appropriate.
- Add unit tests for preseason, one synced week, historical week, unsynced week,
  invalid URL values, and leagues with different current weeks.

### 3. Complete inline matchup view

Implement card expansion without route navigation. The DB already has most of
the spine, but add queries/storage needed for both teams' player rows.

Show:

- a weekly you-vs-opponent starter summary at the top (played, live, and to
  play), reusing the collapsed card counts and never filtering to "today";
- starters and bench for both sides;
- player name, slot, NFL opponent/game state;
- current points and provider-native projected points;
- injury/lock state and remaining-to-play state;
- last provider capture/sync timestamp.

Fetch platform data only through sync/connector ingestion. Page rendering still
reads Postgres only. Use a small client component for expansion state and keep
the data server-sourced.

Live score freshness is implemented through `LiveRefresh` and
`POST /api/live/sync`: visible dashboards check every 30 seconds, provider
pulls are limited to once per minute and only during real NFL game windows,
and successful pulls call `router.refresh()`. The endpoint is protected by the
existing password proxy, rejects cross-origin POSTs, checks recent `sync_runs`
for cross-instance cooldown, and coalesces in-flight work in one instance.
Vercel cron is deliberately daily-only so the prototype deploys on Hobby.

Account freshness now uses the same endpoint and client timer. While the
dashboard is visible, each connected provider refreshes leagues, teams,
rosters, and the current matchup at most once every five minutes, including
outside NFL game windows. This `account` mode deliberately skips the full
transaction sweep. It refreshes the current matchup and backfills only missing
schedule weeks, covering leagues that move from pre-draft to in-season between
daily jobs without repeatedly downloading the entire season. Sleeper roster
caching expires after 30 seconds so a warm local/Vercel process cannot preserve
an old lineup forever.

Provider football clocks must be normalized before they reach the dashboard.
Sleeper advances `state.week` during NFL preseason, so its adapter maps
`season_type === "pre"` to fantasy Week 1. This keeps drafted leagues and their
published future schedules visible without falsely calling NFL preseason Week
2 the current fantasy week. The dashboard ignores pre-draft and completed
leagues when selecting a shared current week and does not expose a PRE tab.
The path was verified against the live Supabase project on 2026-08-17: a
dashboard load completed an `account` run in under nine seconds, advanced the
stored Sleeper current week, imported 1,489 roster rows and 42 current-week
matchup rows across ten leagues, and returned `AUTO SYNC READY` with no browser
console errors.

This is platform infrastructure, not a Sleeper-only UI. Every enabled adapter
must write the same canonical matchup, roster-entry, player, and real-game
fields. `LiveRefresh`, the weekly you/opponent summary, inline starters and
benches, game/lock state, and automatic redraw then work unchanged for ESPN and
Yahoo. Provider-specific code belongs only at adapter/connector boundaries;
do not fork dashboard components or invent a second refresh loop per platform.
The live endpoint currently enables Sleeper because that is the only finished
adapter, and must iterate all enabled provider adapters as they land.

The collapsed card and expanded matchup header must use the same shared,
accessible platform-logo component. Expanding a matchup must not regress to a
two-letter monogram.

Sleeper Chopped leagues are a distinct canonical format, detected from
`settings.type = 3`. They use a league-wide Chopping Block card and standings,
not a fabricated head-to-head opponent. Future Yahoo/ESPN guillotine formats
must normalize into the same `chopped` presentation.

Do not restore the global dot/blinker field. It becomes unreadable across many
leagues and omits opponent context. The collapsed card uses compact counts with
a hover/keyboard-focus table; the expanded view owns player-level status.

### Deferred final milestone: Yahoo official connection and writes

Product decision recorded 2026-08-17: stop Yahoo implementation here and save
it until the end. The next active development work is the non-Yahoo roadmap,
starting with M5 whole-league scoreboard expansion. Do not request Yahoo keys,
enable the Yahoo login mark, record real Yahoo data, or build provider writes
as part of the current milestone.

### M5 whole-league scoreboard checkpoint

Work began on `codex/m5-whole-league-scoreboard`. The dashboard already fetched
all canonical matchup rows for the selected week; M5 now pairs reciprocal rows
once and passes a serializable league scoreboard to each head-to-head card.
The user's matchup sorts first, unmatched rows remain honest byes, and every
scoreboard game can expand inline to the provider-synced starters and bench.
Chopped leagues keep the existing Chopping Block view because their league-wide
competition is not a set of head-to-head matchups.

M5 is complete after the follow-up standings slice. Head-to-head cards expose
MATCHUPS / STANDINGS tabs; standings use the already canonical provider rank,
record, points-for, and points-against fields rather than deriving season state
from one week's matchup rows. When all teams are 0-0 with zero points, show a
preseason message instead of arbitrary numbered ranks. M6 is the password-free
ESPN browser connection and canonical read sync. ESPN credentials stay inside
ESPN's signed-in browser session and must never be accepted or stored by Slate.
Yahoo remains the final provider milestone.

### M6 ESPN connector checkpoint

M6 began on `codex/m6-espn-connector`. Pairing now allowlists both Sleeper and
ESPN while continuing to reject Yahoo from the browser-connector path. The
extension stores separate Slate-issued ingest credentials per platform so an
ESPN pairing cannot overwrite an existing Sleeper pairing. Selecting the ESPN
logo starts the same short-lived challenge/claim flow and opens ESPN's fantasy
football site for normal provider-hosted sign-in. Slate does not receive or
store the ESPN password, ESPN cookies, or the user's browser session.

The capture/normalization slice is now implemented in the same branch. A page
bridge observes only GET responses from ESPN's exact fantasy league-read path,
reduces them to a strict allowlist, and the service worker and Zod server
boundary validate the reduced shape again. The server normalizes and upserts
leagues, teams, provider standings, current rosters, player crosswalks, native
projections, and every captured weekly matchup. Connector tokens are enforced
per platform, so a Sleeper token cannot submit an ESPN payload. Raw response
objects, headers, cookies, local storage, and browser sessions are never sent.

M6 read-only connection is implemented and verified against a real signed-in
ESPN account. Current field shapes, ownership detection, canonical ingestion,
automatic discovery, same-tab return, and background refresh are implemented.
Remaining follow-up is deployed/long-idle validation, including expired-session
reconnect behavior; it is not a blocker for merging PR #11.

Connector 0.3.2 uses ESPN's fantasy-game welcome URL
(`https://fantasy.espn.com/football/welcome`) after pairing. The bare
`https://fantasy.espn.com/football/` root returns a not-found page, while the
`www.espn.com/fantasy/football/` URL is primarily ESPN's fantasy content/news
surface rather than the league-manager entry. League pages on the fantasy host
remain approved for the narrow capture content script.

The Sleeper and ESPN marks remain buttons even after the server has recorded an
installation. Clicking a connected mark intentionally starts a fresh pairing
and replaces only that platform's extension-local token. This is required after
an unpacked extension is removed/reinstalled because Postgres may retain the
old installation while Chrome has lost its local token.

The first real ESPN capture on 2026-08-17 verified league `1885533299` without
persisting any session secret: ownership resolved to team 4, 12 teams were
canonicalized, and 84 scheduled games became 168 team matchup rows. The base
league response did not include rosters or projections. Connector 0.3.3 now
follows that response with one allowlisted in-page request combining `mTeam`,
`mRoster`, `mMatchup`, `mMatchupScore`, and `mSettings` for the current scoring
period. It uses the page's existing signed-in fetch context but never reads or
transmits cookie values. Revalidate roster/player/projection counts after the
extension is reloaded and the league page is refreshed.

The first real league was legitimately undrafted, which explains its empty
rosters and projections. Connector 0.3.4 reads ESPN's boolean
`draftDetail.drafted` flag and gives an explicit `false` priority over the
presence of a published schedule, preventing an undrafted league from being
misclassified as in-season. Empty pre-draft rosters are expected and must not
be treated as a failed capture.

Connector 0.4.1 adds automatic ESPN league discovery. After normal ESPN
sign-in, the content script scans only visible ESPN links for numeric
`leagueId`, `teamId`, and `seasonId` query parameters. It sends at most ten
identifier sets to the page bridge, which constructs only the exact allowlisted
league-read API path and requests the approved combined views. DOM text,
passwords, cookies, request headers, local storage, browser session data, and
arbitrary URLs are never transmitted. This removes the need to open every
league individually when ESPN's home page renders league links. Real-account
verification must confirm the expected league set and ownership mapping before
PR #11 is merged. Refresh while no ESPN page is open remains a later slice.
The 0.4.1 patch also leaves ESPN's original fetch promise untouched and catches
both synchronous and asynchronous enrichment failures, preventing ordinary
ESPN network failures from being reported as unhandled connector errors.
The dashboard treats canonical `pre_draft` status as authoritative even when a
provider publishes placeholder schedule rows, so undrafted ESPN leagues render
the pre-draft card instead of a fabricated matchup.

Connector 0.5.1 adds Chromium background refresh. The content script retains
at most ten sanitized numeric `leagueId`/`teamId`/season references in extension
local storage. A Chrome alarm wakes the service worker, which constructs only
the exact allowlisted ESPN league-read URL, asks Chromium to perform the request
through the browser-managed signed-in session, sanitizes the response locally,
and submits the existing strict snapshot envelope. The extension never calls
the cookies API and never reads, stores, logs, or transmits passwords, cookie
values, headers, arbitrary URLs, or raw ESPN responses. The ingest response
selects a five-minute idle cadence or one-minute live cadence using Slate's NFL
game window. Chromium must remain open, but no ESPN tab is required. Firefox is
out of scope; Safari remains an optional later distribution target. This path
was verified against a signed-in ESPN account on 2026-08-18.
Pairing also stores the originating Slate tab as a one-time local return target.
The provider replaces Slate in that same tab; only after the server confirms
that a sanitized capture was stored does the connector navigate back to Slate
with `?connection=sleeper-connected` or `?connection=espn-connected`. Slate then
shows an explicit “connected and synced just now” notice. Login alone never
triggers success, failed capture leaves the provider page available, and no
password, cookie, header, or raw response is added to the return state.

Connector 0.6.1 fixes fresh-account Sleeper onboarding. After the user signs
in on Sleeper, the connector reads only Sleeper's non-secret numeric `user_id`
local-storage key (never token, email, password, cookies, headers, or any other
storage key). The server binds that ID to the authenticated Slate owner, imports
all leagues/teams/rosters and every published matchup week through Sleeper's
public read API, and returns to Slate only after that owner-scoped import
succeeds. Users no longer open an individual matchup to establish the initial
connection. Periodic/live sync and sync-run cooldown queries are owner-scoped;
one Slate account must never read, refresh, or inherit another account's data.
Pairing navigates the originating Slate tab to the provider rather than opening
a second tab, then navigates that same tab back only after successful ingest.
During NFL preseason, drafted leagues use fantasy Week 1 and sync every
provider-published future matchup week; the dashboard does not expose a separate
preseason view. Only leagues whose provider status is truly pre-draft show
`PRE-DRAFT`.

This remains read-only. Sleeper provides no official OAuth/write API. A future
lineup action still requires an active signed-in Sleeper browser session and
must be an explicit, confirmed connector command with stale-lineup protection
and provider read-back. The public user ID alone never grants write access.

Yahoo's current onboarding differs from the older YDN flow described in parts
of its documentation. Fantasy API access now starts with a reviewed application
at `https://sports.yahoo.com/developer/access/`. The generic YDN Create
Application form may not list Fantasy Sports at all; OpenID Connect permission
alone is insufficient. Access is read-only by default, and a future Slate
application must explicitly request Read/Write access in Additional Notes.

When this work resumes, use `http://localhost:3000/` as the local Homepage URL
and `http://localhost:3000/api/auth/yahoo/callback` as the Redirect URI. For
Vercel, register the deployed callback and set the identical production
`YAHOO_REDIRECT_URI`; the Consumer Key/Secret otherwise remain application
credentials. They are never user-entered fields.

Yahoo supports OAuth and Fantasy Read/Write authorization. Implement the
Authorization Code flow with state + PKCE where supported, exact redirect URI,
encrypted refresh-token storage, rotation handling, and required Yahoo
attribution. Use Yahoo's documented roster update resource for lineup changes.

Before enabling a write action, record response fixtures and verify the current
Yahoo documentation. Do not infer an endpoint from old samples.

The dashboard connection surface is one compact `LOGIN` rectangle on the
header's right side containing the compact official Sleeper, Yahoo `y!`, and
ESPN `E` marks—no explanatory descriptions. Each mark is the connection target and exposes its
state through an accessible label/title, never a provider password field. The
Yahoo and ESPN marks are stored locally in `public/brands`. Yahoo uses its
hosted OAuth consent screen; ESPN/Sleeper must retain the approved password-free
connector pattern. Provider refresh tokens are encrypted at rest and
authorization codes/access tokens are never stored.

#### Current Yahoo checkpoint — frozen until the final milestone

- Read-only OAuth and canonical imports were merged to `main` in PR #7,
  including per-provider live refresh, five-minute account refreshes, and
  missing-week backfill when a league moves from pre-draft to in-season.
- The provider-neutral lineup-command foundation was started on
  `codex/m4-lineup-command-foundation`. It adds deterministic lineup hashes,
  five-minute previews, stale/locked/expired rejection, idempotency keys, and
  server-only command plus append-only status-event records. Command records
  contain no provider credentials, cookies, headers, or raw responses.
- Migration `20260817212000_lineup_command_foundation.sql` was applied to
  Supabase project `qqxceojybbacughapnom` on 2026-08-17. Both tables have RLS,
  deny `anon`/`authenticated`, allow `service_role`, and passed a rollback-only
  insert/audit-trigger verification. Generated TypeScript database types match
  the deployed schema.
- The server-side preview service is implemented in `src/lineup/store.ts` and
  exposed to future matchup controls through a Server Action. The browser sends
  only league/team/week and two player IDs; Slate re-reads the owned canonical
  roster, derives names and current slots, checks both players' NFL lock state,
  computes the full-lineup hash, and persists a five-minute exact swap preview.
  No provider request is made by this action.
- Preview retries reuse an idempotency key derived from both affected players,
  the expected lineup state, and expiration. Status changes use conditional
  updates, permit only forward transitions, and automatically append audit
  events. `verified` additionally requires a sanitized provider read-back hash
  equal to the expected lineup hash; raw provider payloads are rejected by the
  audit-result schema.
- This foundation does **not** enable a real lineup write. Yahoo stays read-only
  until an approved developer app and sanitized roster-update/read-back
  fixtures prove the current official request shape. Sleeper/ESPN stay
  read-only until their experimental connector command paths are separately
  allowlisted and verified.
- Before enabling lineup writes, connect an approved Yahoo developer app in a
  non-production environment and record sanitized response fixtures for
  leagues, standings, weekly rosters, scoreboards, and roster-update read-back.
- Validate the exact roster-update request against the current Yahoo developer
  documentation and a disposable lineup. Do not infer it from old examples.
- The first write remains a same-roster slot swap with preview, explicit user
  confirmation, stale-lineup hash rejection, idempotency, provider submission,
  and read-back verification. Transactions and commissioner actions remain
  out of scope.

#### M4 command state machine

`pending → submitted → verified` is the only successful path. A command may
instead end as `rejected`, `expired`, or `unknown`. Slate must never render a
successful edit from a provider 2xx alone; only a provider re-read matching the
intended lineup may set `verified` and refresh canonical roster rows.

The database transaction that creates or advances a command must finish before
any provider HTTP/browser operation begins. Submission and read-back run
outside database locks, then update the command with a conditional status
transition. The unique idempotency key prevents retries/double-clicks from
creating a second provider write for the same expected lineup state.
Lock state and the current lineup hash must be re-derived server-side during
confirmation; values returned by the browser are preview-only and untrusted.

When the final Yahoo milestone begins, its first slice is the provider-write
boundary: obtain reviewed access, record approved sanitized read and
roster-update fixtures, translate the exact two-player swap into Yahoo's then-
current documented request, submit outside the database transaction, re-read
the roster, and advance the existing command through the state machine. Do not
render Yahoo lineup controls before that end-to-end path has been verified
against a disposable Yahoo lineup.

### 5. Experimental Sleeper/ESPN lineup actions

Only begin after read-only capture and expanded matchups work for that provider.

Architecture:

- Slate creates a narrow pending command such as `move_player`, containing
  provider, league, team, week, player, from-slot, to-slot, expected current
  lineup hash, expiration, and idempotency key.
- The local extension accepts only a versioned allowlist of command schemas.
- The provider page/session performs the exact operation locally. Do not send
  auth material to Slate.
- Capture the resulting provider response, then re-read the lineup and compare
  it to the intended state.
- Store command/audit status: `pending`, `submitted`, `verified`, `rejected`,
  `expired`, `unknown`.
- If the provider UI/API changes or read-back disagrees, mark `unknown` or
  `rejected`, keep the old cached lineup, and show the provider deep link.

Start with lineup slot swaps only. Add/drop, waiver, trade, commissioner, and
league-setting operations are out of scope until lineup edits are reliable.

## Acceptance criteria

- A new user never copies a key, password, cookie, or token.
- The dashboard shows Connect/Connected/Reconnect separately for each platform.
- Week selection is visible on first load even if only week 1 has data.
- Every league stores a canonical `league_type` (`redraft`, `keeper`, or
  `dynasty`) independently from its competition `format`; future Yahoo/ESPN
  adapters must normalize their equivalent values into the same field.
- A matchup expands inline at 360px without horizontal page overflow.
- Yahoo lineup changes use official OAuth/API and are verified by re-read.
- Sleeper/ESPN edits are labeled Experimental at the action point.
- Locked players cannot be submitted; stale lineup hashes require refresh.
- Double-click/retry cannot perform the same write twice.
- Audit rows contain no credentials or session material.
- `npm test`, `npm run lint`, and `npm run build` pass.
- Browser verification covers dashboard → command → connector/provider →
  read-back → updated dashboard.

## Files to start with

- `src/components/ConnectorStatus.tsx`
- `src/app/api/connector/pair/route.ts`
- `src/app/api/connector/ingest/route.ts`
- `src/connector/protocol.ts`
- `src/connector/store.ts`
- `connector/popup.js`
- `connector/service-worker.js`
- `src/components/WeekPicker.tsx`
- `src/lib/dashboard.ts`
- `src/components/LeagueCard.tsx`
- `src/adapters/types.ts`

## Verification baseline

The Sleeper native-projection path has been verified against Sleeper's web UI
and the live Supabase project. No active test connector remains paired.
