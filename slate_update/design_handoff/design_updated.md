# Slate — updated design spec

Handoff for implementing the current Slate shell design in the real codebase.

## About these files

`Slate App Shell.dc.html`, `Slate Sign-in.dc.html`, and `Slate Redesign.dc.html` in this project are **design references written in HTML** — prototypes of intended look and behavior, not production code to copy. Recreate them in the app's existing environment (React Native / React / whatever the repo uses) with its own components, routing, and data layer. Fidelity is **high**: colors, type, spacing, and copy below are final.

Primary file: `Slate App Shell.dc.html` (the logged-in home). Everything below describes it.

## Design tokens

Dark ("Floodlight") is default; light ("Daybreak") swaps the same token names.

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--ink` | `#0F151A` | `#EDEDE7` | page background |
| `--deep` | `#0c1216` | `#F7F7F3` | header, ticker, table headers, active rows |
| `--raised` | `#171F26` | `#F7F7F3` | cards, list rows |
| `--line` | `#253039` | `#D4D5CC` | all 1px borders and dividers |
| `--bone` | `#E8E5DE` | `#161C21` | primary text |
| `--dim` | `#8D959D` | `#646C74` | secondary text, opponent values |
| `--stone` | `#5A6670` | `#8B939A` | mono labels, metadata |
| `--amber` | `#F2A33C` | `#C77A16` | live state, "you", active accent |
| `--turf` | `#4E9B6E` | `#2F7A4E` | win / safe / positive delta |
| `--flag` | `#CC5847` | `#B0402F` | loss / chop zone / sync failure |
| `--mark-off` | `#39454f` | `#C3C5BC` | inactive logo squares |

Type: **Archivo** (variable, `wght 800`, `wdth 118`) for numerals and card titles; **Public Sans** 400/500/600 for prose; **DM Mono** 400/500 for every label, metadata, and status string. Mono labels are uppercase with `letter-spacing` .06–.15em at 9–11px. Numbers use `font-variant-numeric: tabular-nums`.

Radii: 3px (chips, small buttons), 4px (buttons, tabs), 5px (tables, list containers), 6px (league cards), 99px (dots, toggles, avatars). Spacing rhythm: 6 / 8 / 10 / 12 / 14 / 16 / 18px. No shadows anywhere — separation comes from `--line` and `--raised`.

Shell: single column, `max-width: 560px` under 1000px viewport width, `1080px` at or above, with left/right `--line` borders. Section padding `16–18px`.

## Layout, top to bottom

1. **Sticky header** (`--deep`, bottom border). Left: 17px four-square logo mark (top-left square `--amber`, rest `--mark-off`), `SUNDAY · 1:07 PM` in mono, then `WEEK {n}` at Archivo 30px/1, `-0.02em`. Right column, right-aligned: `ACCOUNT` button (initials chip + label; border turns `--amber` when the sheet is open), FLOODLIGHT / DAYBREAK segmented theme toggle (active segment is `--bone` fill with `--ink` text), a pulsing `4 LIVE` amber dot (`livedot` 2s ease-in-out infinite, opacity 1 → .25), and a row of three platform marks (Sleeper / Yahoo / ESPN, 14px; `opacity .3` when not connected) followed by `SYNCED 7M AGO · 12 LEAGUES`. Both the marks row and the sync line open the account sheet.
2. **Week selector.** `SEASON WEEK` label, a native `<select>` styled to match (`--raised` fill, `--line` border, mono 10.5px, custom ▼ glyph, no default appearance), options `WEEK 1 · CURRENT` through `WEEK 18`, then `SYNCED · LIVE`. Changing it updates the `WEEK {n}` title.
3. **Score ticker.** Full-bleed `--deep` strip, 9px vertical padding, `overflow: hidden`. Inner row is `width: max-content` with the item list rendered **twice** and animated `translateX(0 → -50%)` over 42s linear infinite, so the loop is seamless. Animation pauses on hover. Each item is a button — mono 11px, 16px side padding, `--line` right divider — showing home team, score, away team; your team's name is `--amber`. Tapping an item smooth-scrolls to that league's card (offset 90px for the sticky header).
4. **Around the league.** `AROUND THE LEAGUE` / `2 LIVE · 1 FINAL · 11 TO PLAY`, then a horizontally scrolling row (scrollbar hidden) of 118px game boxes: away row, home row, then a top-bordered status line. Leading team is `--bone`, trailing `--dim`, both `--dim` pre-kickoff; live status is `--amber`, otherwise `--stone`.
5. **Account sheet** (collapsible, `--deep`). Avatar + name + email, `CLOSE ↑`. `CONNECTIONS` block with `RESYNC ALL` (shows `SYNCING…` for 1.6s, then a confirmation toast): one row per platform with either a green `SYNCED` dot or a `CONNECT` button — connecting flips the row and fires "{Platform} connected and synced just now." Below, two accordion rows: **NOTIFICATIONS** (5 pill toggles: close game alerts, lineup not set, survival chop zone, injury on a starter, weekly recap; on = `--amber` track, `--ink` knob, knob right) and **LEAGUE ORDER & VISIBILITY** (drag handles, per-league `SHOWN` / `HIDDEN` toggle). Last item is a `SIGN OUT` button outlined in `--flag`.
6. **League list.** `CLOSEST MARGIN FIRST · DRAG TO REORDER`, then cards in a grid: one column on phone, two at ≥1000px with the first two cards spanning full width. Each card is `--raised`, 6px radius, with a 4px left accent bar whose color encodes state (`--amber` live, `--stone` final, `--turf` best ball, `--mark-off` bye, `--flag` failed). Header row: drag handle `⠿`, 16px platform mark, Archivo title, mono format subtitle, right-side status.
7. **Confirmation strip.** Sticky at the bottom of the shell, `--raised`, green dot + sentence, auto-clears (3.6s, 4.2s for the sync failure message).
8. **Demo state footer** — prototype scaffolding only (`LEAGUES` / `NO LEAGUES`). Do not ship.

## League card types

- **Head-to-head, live** (Sunday Syndicate, dynasty). Two score rows (your name `--bone` 600 with `proj`, opponent `--dim`), 30px Archivo totals; a 3px win-probability bar (`--turf` / `--flag`) with `YOU 69%` / `OPP 31%`; `YOU 11 LEFT · OPP 11 LEFT`; two side-by-side buttons, `VIEW MATCHUP ↓` and `VIEW LEAGUE ↓`, each toggling to `HIDE … ↑`.
  - **Matchup expansion:** a `WEEK n STARTERS` table (PLAYED / LIVE / TO PLAY × YOU / OPP, LIVE row amber), then a mirrored starter list — your player left with position tag, points over projection, opponent's mirrored right. Footer: `LINEUP CHANGES HAPPEN IN SLEEPER` + `BENCH ↓`, which expands a 7-row bench list (`YOUR BENCH` / `7 PLAYERS · 1 FLAG`); a flagged player's metadata is `--flag` on a `--deep` row.
  - **League expansion:** `ALL MATCHUPS` header with week, a MATCHUPS / STANDINGS tab pair (active tab = `--bone` fill, `--ink` text), the matchup list (your row on `--deep`, `YOU` tag in amber, both scores with `PROJ` under), or the standings table (#, team, REC, PTS). Footer line names the sync source and last provider sync.
- **Survival / chopped** (The Waiver Wire). `SURVIVAL RANK 4/12` and `PROJECTED 128.6`, chop-zone line, `CHOPPING BLOCK ↓`. Expansion is the ladder sorted low projection first, your row on `--deep` with an amber `YOU` tag, the bottom team in `--flag` with a `CHOP ZONE` tag, and a full-width **chop line** divider (`CHOP LINE` in flag, hairline rule, `SAFE ABOVE`) drawn above it; footer shows `YOUR MARGIN TO THE LINE +19.4` in `--turf`.
- **Head-to-head, final** (Third & Long, ESPN keeper). Both scores, winner in `--turf`, `WON BY 43.2`, `VIEW MATCHUP ↓`. Expansion is `FINAL BOX SCORE` by position (QB / RB / WR / TE / K+DEF / TOTAL), winner column `--bone` with the TOTAL row on `--deep` and `--turf`, plus top scorer and record.
- **Best ball** (Ballers Anonymous, Yahoo). `WEEK TOTAL 141.8`, `SEASON RANK 3/18`, footer `BEST 9 OF 18 COUNT · +12.4 VS FIELD AVG`. No lineup actions — nothing to set.
- **Playoff bracket** (Dynasty Warriors). `ROUND 2` / `PLAYOFFS · SEMIFINAL`; two seed rows, yours outlined in `--amber` on `--deep`; footer names the final's opponent.
- **Bye week** (The Punt Return). Muted (`opacity .85`, `--mark-off` bar, `--dim` title), one sentence explaining the odd team count, footer with the next game week.
- **Pre-draft** (League of Mahomes). Dashed border, no accent bar, `PRE-DRAFT` status, one sentence about the draft time, footer `9 OF 10 MANAGERS JOINED` + `DRAFT ORDER →`.
- **Sync failed** (Office League 2019, ESPN). `--flag` border and bar, `SYNC FAILED`, copy stating scores are from the last good sync; `RETRY SYNC` (→ `RETRYING…` for 1.8s, then the failure toast) beside a `CONNECTIONS` button that opens the account sheet.

## Empty state

`NO LEAGUES YET` — 44px four-square mark, one sentence about adding a Sleeper username, `OPEN CONNECTIONS` button. Centered, 60px vertical padding.

## State

`theme` (dark|light, written to `data-theme` on the root), `week` (1–18), `expanded` / `leagueOpen` / `benchOpen` / `chopOpen` / `finalOpen` (per-card disclosure), `leagueTab` (matchups|standings), `accountOpen`, `accountTab` (''|notifs|order), `connected[]` platforms, `notifOn[]`, `hiddenLeagues[]`, `syncing`, `retrying`, `toast` string with a self-clearing timer, `wide` from a `resize` listener at the 1000px breakpoint. All demo data is inline in the prototype's logic class — replace with real provider data.

## Assets

`brands/espn-mark.svg`, `brands/yahoo-mark.svg` (both in this project); the Sleeper mark is loaded from `sleepercdn.com` in the prototype and should be bundled locally instead. Fonts come from Google Fonts: Archivo (variable `wdth`/`wght`), Public Sans 400/500/600, DM Mono 400/500. Respect `prefers-reduced-motion` — the prototype disables all animation under it.

## Not designed yet

Draft order screen, notification delivery detail (push vs email), reordering persistence, and any tablet-specific layout between 560 and 1000px.
