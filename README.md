# Slate

## User accounts and data isolation

Slate now uses Supabase Auth rather than a shared application password. Signed-out
visitors are redirected to `/login` and receive no fantasy data. Connector
pairings and league data are scoped to the authenticated user; signing out hides
cached data without deleting it. Provider passwords are never received or stored.

One screen for fantasy leagues spread across Sleeper, ESPN, and Yahoo.
Single-user prototype, with verified provider actions where supported. Named
for the set of games in a window.

## Native browser connector

Slate can receive private, site-native fantasy data without collecting a
platform password or copying browser cookies. The optional Manifest V3
connector watches only allowlisted fantasy responses while the user is signed
in on the provider site, removes unapproved fields, and sends the sanitized
payload to Slate through an ingest-only token. The dashboard remains the one
screen used day to day.

The first end-to-end provider is Sleeper: its native `proj_points` values
override the public generic projections and survive normal scheduled syncs.
See [`connector/README.md`](connector/README.md) for local installation. Yahoo
and ESPN can be added to the same protocol after recording and testing their
approved response shapes; Yahoo OAuth remains the preferred production path
where it supplies equivalent data.

Sleeper now uses one-click automatic pairing with the installed connector. A
five-minute, single-use challenge is exchanged in the background; no connector
token is rendered or copied. Provider login remains on the provider's own page.
Connector 0.6.1 reads only the signed-in account's public numeric Sleeper user
ID, imports all leagues and published weeks automatically, and returns to Slate
only after the account-scoped import succeeds. It never reads Sleeper's token,
email, password, or cookies.

Yahoo uses its official OAuth Authorization Code flow with S256 PKCE. Slate
stores only an AES-256-GCM encrypted refresh token, mints access tokens in
server-side sync jobs, saves refresh-token rotation before continuing, and
imports Yahoo leagues, teams, weekly rosters, matchup scores, and provider
projections into the same canonical tables and dashboard used by Sleeper. Once
connected, Yahoo also participates in the shared live-refresh loop; cooldowns
are tracked per provider so a recent Sleeper pull cannot suppress Yahoo.

### Yahoo integration — deferred until the final milestone

Do not treat Yahoo credentials or approval as a blocker for current work. The
repo contains a read adapter and OAuth scaffolding, but real Yahoo connection
and all Yahoo writes are intentionally deferred until Slate's core hub and the
other planned provider work are complete.

Yahoo's current Fantasy developer process requires a separate reviewed access
application at `https://sports.yahoo.com/developer/access/`. The generic Yahoo
Developer Network Create Application form may show only OpenID Connect and TW
Auction; creating that generic app alone does not grant Fantasy access. Yahoo
says Fantasy access is read-only by default, so the final application must
truthfully explain Slate's use case and explicitly request Read/Write access in
Additional Notes.

After Yahoo approves/provisions access, configure these values only in the
local/deployment environment:

```text
YAHOO_CLIENT_ID
YAHOO_CLIENT_SECRET
YAHOO_REDIRECT_URI
PLATFORM_TOKEN_ENCRYPTION_KEY
```

For local development, Homepage URL is `http://localhost:3000/` and Redirect
URI is `http://localhost:3000/api/auth/yahoo/callback`; do not put the callback
path in the Homepage field. A Vercel deployment keeps the same application
credentials but registers the deployed callback and sets the exact production
`YAHOO_REDIRECT_URI`. Never commit any value above. End users only click the
Yahoo mark and sign in on Yahoo's hosted consent page; Slate never accepts or
stores their Yahoo password.

- `CLAUDE.md` — the build brief. Point your coding agent at this first.
- `DESIGN.md` — visual direction, tokens, the signature feature.
- `HANDOFF-M3.md` — current state, completed M3/M4 foundation, and next work.
- `preview.html` — open in a browser to see the target design.

---

## Running it

The Supabase project (`slate`, ref `qqxceojybbacughapnom`) exists and
migrations `init` and `nfl_games` are applied. One secret is still missing:

```bash
npm install
```

Then put your **service role** key in `.env.local` as
`SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → Project Settings → API
keys. Nothing server-side can read or write until it's set. With that in
place, fill the database in order:

```bash
npm run sync -- players
```

```bash
npm run sync -- daily
```

```bash
npm run sync -- live
```

`players` builds the ~11k-row directory and the crosswalk. `daily` pulls
leagues, teams, rosters, transactions, and every provider-published matchup
week—including future pairings. `live` refreshes current scores plus NFL game
state. Order matters on a cold database; a separate `backfill` is only a repair
tool because normal daily sync already covers the full schedule. Then:

```bash
npm run dev
```

## Checking the data path without a database

```bash
npm run smoke
```

Prints your Sleeper leagues, your team in each, and the current week's
score. Touches Sleeper but not Postgres, so it works before the service
role key is set.

## Tests

```bash
npm test
```

128 tests, all against local fixtures and synthetic connector payloads. No test hits a live API. Re-record
with `npm run fixtures` only when you deliberately want to refresh against a
schema change.

## Sync cadence

`vercel.json` keeps the two maintenance jobs (`players` and `daily`) at a
once-per-day cadence supported by Vercel Hobby. Live scoring does not depend on
paid cron: while an authenticated dashboard is visible, it refreshes league,
team, roster, and current-matchup data at most once every five minutes. During
an active NFL game window it checks every 30 seconds and pulls live scores at
most once per minute. Provider cooldowns are independent. Hidden tabs do not
poll. A successful pull refreshes the Server Component automatically, so
account changes and current scores appear without a manual reload.

This demand-driven path is intended to remain $0 for the single-user prototype.
It skips the expensive 18-week transaction sweep during five-minute account
refreshes and uses ordinary Vercel Function and Supabase database quotas;
revisit the cadence and hosting plan before opening the dashboard to many
simultaneous users.

## Order of operations

1. ~~**M0** skeleton + migration + password gate~~ — done
2. ~~**M1** Sleeper adapter → sync job → crosswalk → one league rendering live~~ — done
3. **M2** the "Left to play" band — code/schema complete; awaiting initial data sync
4. **M3** automatic connections, persistent week selector, and complete inline matchups
5. **M4** secure provider-neutral preview, idempotency, and command/audit
   foundation — implemented; provider write controls remain disabled
6. **M5** inline whole-league scoreboard and standings — implemented. Every
   weekly matchup is paired once, the user's game stays first, any game expands
   to its synced lineup, and standings use provider rank/record data.
7. **M6 (in progress):** ESPN password-free browser connection and canonical
   read sync. Pairing, ESPN-hosted sign-in, strict response capture, and
   canonical league/team/standings/roster/matchup ingestion are implemented.
   Connector 0.6.1 automatically discovers up to ten leagues from ESPN's own
   visible league links after sign-in and refreshes them in the Chromium
   background every five minutes, or every minute during live games. Chromium
   must remain open; no ESPN tab is required. Real-account background-refresh
   verification remains. Slate never accepts or stores the ESPN password.
   Sleeper and ESPN pairing return the user to the originating Slate tab only
   after the first sanitized provider capture has been stored successfully.
8. **Final provider milestone:** complete Yahoo's reviewed OAuth/Fantasy access,
   verify real read fixtures, then add confirmed Yahoo lineup submission

Don't start a milestone until the previous one works against real data.

### M2 implementation

- `is_final` now comes from the real NFL slate reaching completion.
- The card footer shows a projection-based win probability whose variance
  shrinks with the number and game progress of remaining starters. If required
  projection data is missing, it deliberately falls back to the score margin.
- The spine reports played, live, upcoming, and bye/unmatched starters.

## Costs

Expected cost for the single-user prototype is $0, provided it stays within the
free-plan quotas. As checked on 2026-08-17, Vercel Hobby includes one million
function invocations, four active CPU hours, and 360 GB-hours of provisioned
memory per month. Supabase Free includes unlimited API requests, a 500 MB
database, and 5 GB each of egress and cached egress. The browser-driven account
sync runs only while the dashboard is visible and is capped at once per five
minutes per provider; live scoring is capped at once per minute during active
NFL games. Revisit these assumptions before adding many users or substantially
more leagues.
