# Slate — Design

## The brief in one line

A phone screen, held at 1:07pm on a Sunday, that tells you how three leagues are
going and what you still need to do about it.

That framing drives everything below. This is not a marketing site and not an
analytics dashboard. It's an instrument panel you glance at.

---

## Direction: Floodlight

Slate is named for the set of games in a window — the thing you are actually
watching. Fantasy Sunday happens in a dim room with a bright screen on. The palette is
built from that: deep blue-cast ink, and one warm sodium-vapor amber that reads
as *live, happening now* the way stadium lights do. Everything not currently
happening recedes.

### The one rule that shapes the whole UI

**Color means game state. Nothing else.**

Not team identity, not platform. The reason is concrete: Sleeper's brand purple
and Yahoo's brand purple are close enough to be indistinguishable on a phone in
sunlight, so brand color can't carry provenance reliably anyway. Platform is
shown with the current official Sleeper, ESPN, or Yahoo mark in a consistent
hairline container. Normalize each mark's size and contrast, give it an
accessible name, and use `SL`, `ES`, or `YH` only as a resilient loading/error
fallback—not as the finished UI. This frees the color budget for the thing you
actually need to see fast: am I winning, is it live, is it final.

---

## Tokens

### Scheme A — Floodlight (default)

```css
--ink:        #0F151A;  /* base — deep blue-cast near-black */
--ink-raised: #171F26;  /* cards */
--ink-line:   #253039;  /* hairlines, 1px only */
--bone:       #E8E5DE;  /* primary text */
--bone-dim:   #8D959D;  /* labels, metadata */
--amber:      #F2A33C;  /* LIVE. the only bright color. use sparingly */
--turf:       #4E9B6E;  /* winning / positive delta */
--flag:       #CC5847;  /* losing / negative delta */
--stone:      #5A6670;  /* final, settled, inert */
```

Amber is rationed. If more than roughly 10% of the screen is amber, something is
wrong — it stops meaning "live" and starts meaning "decorative."

### Scheme B — Daybreak (light alternate)

Same semantics, inverted. For anyone who won't use a dark app outdoors.

```css
--ink:        #EDEDE7;  /* base — cool paper, slight green cast */
--ink-raised: #F7F7F3;
--ink-line:   #D4D5CC;
--bone:       #161C21;  /* text */
--bone-dim:   #646C74;
--amber:      #C77A16;  /* darkened for contrast on light */
--turf:       #2F7A4E;
--flag:       #B0402F;
--stone:      #8B939A;
```

Implement as a `data-theme` attribute on `<html>` swapping the same variable
names. Components never reference a hex directly.

---

## Type

Three faces, three jobs. All on Google Fonts.

| Role | Face | Usage |
|---|---|---|
| Display | **Archivo** (variable, width axis) | Scores, league names. `wdth: 118`, weight 700–800, uppercase, tracking `-0.01em`. The width axis is the move — extended grotesques are the native language of scoreboards without dipping into jersey-number kitsch. |
| Body | **Public Sans** | Player names, prose, buttons. 400/600. Quiet on purpose. |
| Data | **DM Mono** | Timestamps, platform-mark fallbacks, stat lines, sync status. 400/500, `font-variant-numeric: tabular-nums`. |

Scale (mobile-first): 44 / 28 / 20 / 16 / 14 / 12 / 11.

Live scores use Archivo at 28–44 with tabular figures so digits don't jitter as
points tick up. This matters more than it sounds — a score that reflows on every
poll is genuinely annoying.

---

## Signature: matchup-level "Left to play"

The one thing no platform gives you, and the reason to build this at all.

A global dot for every starter does not scale across many leagues and omits the
opponent context needed to judge a matchup. Keep the homepage quiet. Each
matchup card instead shows one compact weekly comparison:

```
  YOU 6 LEFT · OPP 4 LEFT

  hover / keyboard focus:
  WEEK 11 STARTERS       YOU  OPP
  PLAYED                   3    5
  LIVE                     1    0
  TO PLAY                  5    4
```

The counts cover the entire selected fantasy week, never only the current
calendar day. The expanded matchup repeats this comparison at the top, then
provides player names, kickoff/game state, scores, projections, and benches.
This preserves the insight without rendering dozens or hundreds of blinkers.

Everything else on the page stays quiet so this lands.

Each active matchup also shows a mirrored win-probability bar immediately
below the two team scores. Label both sides explicitly (`YOU 38%` and
`OPP 62%`): the higher-probability segment is turf green and the lower is flag
red. A 50/50 tie is neutral stone. Never infer a percentage when the normalized
provider data is incomplete; show `WIN ODDS UNAVAILABLE` instead. The remaining
starter counts sit on their own aligned row below the odds bar.

---

## Layout

Single column, mobile-first. Max width 560px even on desktop — this is a phone
app that happens to open in a browser.

```
┌──────────────────────────────┐
│ SUNDAY          WEEK 11      │  sticky header, Archivo extended
│ synced 2m ago                │  DM Mono, bone-dim
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │logo│ DYNASTY DEGENERATES │ │  platform mark + league, Archivo
│ │                          │ │
│ │ Mahmoud's Team    ● 87.4 │ │  amber dot = live
│ │ proj 121.2               │ │
│ │ ────────────────────     │ │  win-prob hairline
│ │ Sofa Kings          71.9 │ │
│ │ proj 108.0               │ │
│ │                          │ │
│ │ YOU 6 · OPP 4 LEFT       │ │  hover/focus for weekly counts
│ │ VIEW MATCHUP ↓           │ │  inline; no routine provider detour
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ YH │ THE WORK LEAGUE     │ │  Yahoo card gets inline swap
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

Cards default to *drama* order, not alphabetical order: closest margin first,
finals last. A visible drag handle lets the user override that default. The
platform-qualified league order persists across reloads and weeks, while newly
discovered leagues append after the saved order. The same sortable list must
wrap Sleeper, ESPN, and Yahoo cards; provider-specific ordering UIs are forbidden.

### Week selection

The week control is always visible, including preseason and before historical
weeks have been synced. Use a compact horizontal selector for the full fantasy
season. Current week gets the dot; selected week gets the border. Unsynced
weeks remain selectable and show a specific empty state. Never hide the control
just because only one week currently has data.

### Matchup expansion and lineup editing

Pressing a matchup card expands it inline. Do not navigate away from the Slate
screen and do not show routine “Open in provider” buttons on matchup cards. The
expanded state shows a persistent two-column head-to-head view: each of the
user's players stays beside the corresponding opponent player. It includes
both starting lineups, benches, player-level scores and native projections,
game status, and remaining players. Inside each player half, identity/game
context extends toward the outside while the score columns meet at the center:
the user's current points and projection sit immediately left of the divide,
and the opponent's sit immediately right. Current points are larger, with the
smaller projection immediately underneath and no redundant suffix.
Show player projections to two decimals so the value can be compared directly
with the provider. Each player row must also say `PLAYED`, `LIVE`, `TO PLAY`,
`BYE / TBD`, or `CANCELED` for the selected fantasy week; kickoff and opponent
remain supporting context. Other adapters must normalize their provider's
native projection and game-state source into the same presentation.
Preserve the provider's starter-slot order, including empty lineup slots, so
the two sides align exactly like the source matchup. Bench rows include native
current points and projections, group by the provider's positional display
order, and exclude IR/taxi players from the bench section.

When lineup changes are supported, show **Edit lineup** inside the expanded
card. Selection happens inline, but the final action always uses a confirmation
sheet naming the exact players, slots, league, platform, and lock status.
Pending, verified, and rejected states must be textual as well as visual.
Experimental Sleeper/ESPN actions must say **Experimental** beside the action;
do not bury that qualification in settings or help copy.

### Chopped / guillotine leagues

Treat Chopped leagues as league-wide survival contests, never as head-to-head
matchups. Detect the provider's explicit format (`settings.type = 3` for
Sleeper), store it as canonical `format = chopped`, and retain the raw settings.
The collapsed card shows the user's survival rank, projected score, current
Chop Zone team, and margin above the lowest projected score. Its expanded view
is the provider-sourced Chopping Block ordered lowest-to-highest. Do not show an
opponent, head-to-head win odds, or manufacture a matchup pairing. Apply this
format distinction to Yahoo and ESPN if they expose equivalent contests.

---

## Motion

Almost none, deliberately. Three exceptions:

1. Live dot: 2s opacity pulse, `prefers-reduced-motion` disables it.
2. Score changes: 400ms color flash in turf or flag on the delta, then settle.
3. Matchup availability tooltip: a short opacity transition on hover/focus.

No page transitions, no scroll reveals, no skeleton shimmer. Data comes from
your own Postgres — it's already there.

---

## Copy

Plain and specific. The interface never sells.

- Empty: "No leagues yet. Add your Sleeper username in Connections."
- Stale: "ESPN data is 3 hours old. Your cookies may have expired." + Fix link.
- Read-only roster: "Lineup changes for this league happen in Sleeper." + link.
- Failed write: "Yahoo rejected the swap — Kelce's game already started."
  Never "Something went wrong."

Actions keep one name throughout. The button says "Swap," the toast says
"Swapped."

---

## Quality floor

Responsive to 360px. Visible keyboard focus rings in amber. All state colors
paired with a shape or label so they never carry meaning alone. Contrast at
least 4.5:1 for body text in both schemes — check `--bone-dim` on `--ink-raised`
specifically, it's the tightest pair.
