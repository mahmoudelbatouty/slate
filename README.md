# Slate

One screen for fantasy leagues spread across Sleeper, ESPN, and Yahoo.
Read-only. Single user. Named for the set of games in a window.

- `CLAUDE.md` — the build brief. Point Claude Code at this first.
- `DESIGN.md` — visual direction, tokens, the signature feature.
- `preview.html` — open in a browser to see the target design.

---

## Running it

The Supabase project (`slate`, ref `qqxceojybbacughapnom`) exists and
migration `0001_init` is applied. One secret is still missing:

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
leagues/teams/rosters/transactions, `live` writes scores. Order matters on
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

41 tests, all against `fixtures/sleeper/`. No test hits a live API. Re-record
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
3. **M2** the "Left to play" band (Sleeper data is enough)
4. **M3** Yahoo (OAuth read scope)
5. **M4** ESPN (cookie paste)
6. **M5** whole-league scoreboard expansion

Don't start a milestone until the previous one works against real data.

### Known edges left for M2

- `is_final` is derived from the week rolling over, because Sleeper has no
  per-game state. The game-window data M2 needs will sharpen it.
- The card footer shows the margin, not a win probability — that needs a
  variance model, and a made-up percentage is worse than no percentage.
- "N to play" is deliberately absent until the left-to-play spine lands.

## Costs

$0. Supabase free tier, Vercel Hobby, Sleeper free, Yahoo free, ESPN unofficial.
The only thing to watch is Vercel Cron frequency on Hobby — if 5-minute live
sync is too aggressive for the plan, run it from a GitHub Action instead.
