# Slate

One screen for fantasy leagues spread across Sleeper, ESPN, and Yahoo.
Read-only. Single user. Named for the set of games in a window.

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

- `CLAUDE.md` — the build brief. Point your coding agent at this first.
- `DESIGN.md` — visual direction, tokens, the signature feature.
- `HANDOFF-M2.md` — current state, and everything needed to build M2.
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

`players` builds the ~11k-row directory and the crosswalk, `daily` pulls
leagues/teams/rosters/transactions, and `live` writes fantasy scores plus NFL
game state. Order matters on
a cold database. Then:

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

66 tests, all against local fixtures and synthetic connector payloads. No test hits a live API. Re-record
with `npm run fixtures` only when you deliberately want to refresh against a
schema change.

## Sync cadence

`vercel.json` schedules the cron route in UTC (Vercel Cron has no timezone,
and no DST awareness — the windows are set for EDT and drift an hour after
the November changeover). **Vercel Hobby caps cron jobs**, so if the 5-minute
live schedule is rejected, move the `live` entries to a GitHub Action and
keep `daily` + `players` on Vercel.

## Order of operations

1. ~~**M0** skeleton + migration + password gate~~ — done
2. ~~**M1** Sleeper adapter → sync job → crosswalk → one league rendering live~~ — done
3. **M2** the "Left to play" band â€” code/schema complete; awaiting initial data sync
4. **M3** provider connections (Yahoo OAuth + browser connector captures)
5. **M4** ESPN browser connector capture
6. **M5** whole-league scoreboard expansion

Don't start a milestone until the previous one works against real data.

### M2 implementation

- `is_final` now comes from the real NFL slate reaching completion.
- The card footer shows a projection-based win probability whose variance
  shrinks with the number and game progress of remaining starters. If required
  projection data is missing, it deliberately falls back to the score margin.
- The spine reports played, live, upcoming, and bye/unmatched starters.

## Costs

$0. Supabase free tier, Vercel Hobby, Sleeper free, Yahoo free, ESPN unofficial.
The only thing to watch is Vercel Cron frequency on Hobby — if 5-minute live
sync is too aggressive for the plan, run it from a GitHub Action instead.
