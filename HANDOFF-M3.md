# Handoff — M3/M4: seamless connections, complete matchups, lineup actions

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
  `?week=N`, supports preseason and provider season-end metadata, and labels
  current/synced/unsynced states without relying on color.
- Daily sync now imports every provider-published season matchup, including
  future pairings. Users never need to open individual provider matchups to
  populate Slate; private/native fields may arrive separately when published.
- Next implementation slice: the complete inline matchup view.
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
- Never read or transmit cookies, local storage, session tokens, or request
  headers from Sleeper/ESPN connector sessions.
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

- starters and bench for both sides;
- player name, slot, NFL opponent/game state;
- current points and provider-native projected points;
- injury/lock state and remaining-to-play state;
- last provider capture/sync timestamp.

Fetch platform data only through sync/connector ingestion. Page rendering still
reads Postgres only. Use a small client component for expansion state and keep
the data server-sourced.

The collapsed card and expanded matchup header must use the same shared,
accessible platform-logo component. Expanding a matchup must not regress to a
two-letter monogram.

### 4. Yahoo official connection and writes

Yahoo supports OAuth and Fantasy Read/Write authorization. Implement the
Authorization Code flow with state + PKCE where supported, exact redirect URI,
encrypted refresh-token storage, rotation handling, and required Yahoo
attribution. Use Yahoo's documented roster update resource for lineup changes.

Before enabling a write action, record response fixtures and verify the current
Yahoo documentation. Do not infer an endpoint from old samples.

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

At handoff time: 66 tests pass, lint passes, production build passes, and the
Sleeper native-projection path was verified end to end against the live
Supabase project. No active test connector remains paired.
