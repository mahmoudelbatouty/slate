# Slate

One screen for fantasy leagues spread across Sleeper, ESPN, and Yahoo.
Read-only. Single user. Named for the set of games in a window.

- `CLAUDE.md` — the build brief. Point Claude Code at this first.
- `DESIGN.md` — visual direction, tokens, the signature feature.
- `preview.html` — open in a browser to see the target design.

---

## Bootstrap

```bash
npx create-next-app@latest slate \
  --typescript --tailwind --app --src-dir --eslint --use-npm
cd slate

npm i @supabase/supabase-js zod
npm i -D vitest @vitest/coverage-v8 supabase

# drop the handoff files in
cp ../CLAUDE.md ../DESIGN.md .
mkdir -p supabase/migrations src/adapters src/sync src/db fixtures
cp ../schema.sql supabase/migrations/0001_init.sql
cp ../adapter.ts src/adapters/types.ts
cp ../sleeper.ts src/adapters/sleeper.ts
cp ../globals.css src/app/globals.css
cp ../.env.example .env.local
```

Then create a Supabase project, run the migration, and generate types:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase gen types typescript --linked > src/db/types.gen.ts
```

## First thing to verify

Before writing any UI, confirm the data path works end to end:

```bash
npx tsx scripts/smoke.ts        # you'll write this in 5 lines
```

It should print your Sleeper leagues for the current season. If that works,
everything downstream is just rendering.

## Handing off to Claude Code

```
Read CLAUDE.md and DESIGN.md. Then build M0 and M1.
src/adapters/sleeper.ts is already implemented — use it as the reference
for the other two adapters. Do not touch the write path; this app is read-only.
```

## Order of operations

1. **M0** skeleton + migration + password gate
2. **M1** Sleeper adapter → sync job → crosswalk → one league rendering live
3. **M2** the "Left to play" band (Sleeper data is enough)
4. **M3** Yahoo (OAuth read scope)
5. **M4** ESPN (cookie paste)
6. **M5** whole-league scoreboard expansion

Don't start a milestone until the previous one works against real data.

## Costs

$0. Supabase free tier, Vercel Hobby, Sleeper free, Yahoo free, ESPN unofficial.
The only thing to watch is Vercel Cron frequency on Hobby — if 5-minute live
sync is too aggressive for the plan, run it from a GitHub Action instead.
