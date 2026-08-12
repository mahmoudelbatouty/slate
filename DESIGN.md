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
shown as a two-character monogram in a hairline box — `SL` `ES` `YH` — set in
mono. It's unambiguous, colorblind-safe, and it frees the entire color budget
for the thing you actually need to see fast: am I winning, is it live, is it
final.

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
| Data | **DM Mono** | Timestamps, platform monograms, stat lines, sync status. 400/500, `font-variant-numeric: tabular-nums`. |

Scale (mobile-first): 44 / 28 / 20 / 16 / 14 / 12 / 11.

Live scores use Archivo at 28–44 with tabular figures so digits don't jitter as
points tick up. This matters more than it sounds — a score that reflows on every
poll is genuinely annoying.

---

## Signature: the "Left to play" spine

The one thing no platform gives you, and the reason to build this at all.

A horizontal band across the top of the dashboard representing today's game
windows — 1:00, 4:05, 4:25, 8:20 — with a dot for each of your starters across
*all* leagues, positioned in the window their real-life game falls in. Played
dots go stone. In-progress dots go amber. Not-yet-played dots stay bone.

```
  LEFT TO PLAY                                    9 of 27 remaining
  ┌────────────┬────────────┬────────────┬────────────┐
  │   1:00     │   4:05     │   4:25     │   8:20     │
  │ ●●●●●●●●●● │ ●●●●●      │ ●●●●       │ ●          │
  │ ○○○        │ ○○         │            │            │
  └────────────┴────────────┴────────────┴────────────┘
    ● played      ◐ live      ○ yet to play
```

At a glance: your afternoon isn't over, you have four bodies left in the 4:25
window, and a down-by-12 matchup isn't lost. That's the insight the hub exists
to deliver, and it's only possible *because* you aggregated three platforms.

Everything else on the page stays quiet so this lands.

---

## Layout

Single column, mobile-first. Max width 560px even on desktop — this is a phone
app that happens to open in a browser.

```
┌──────────────────────────────┐
│ SUNDAY          WEEK 11      │  sticky header, Archivo extended
│ synced 2m ago                │  DM Mono, bone-dim
├──────────────────────────────┤
│ LEFT TO PLAY        9 of 27  │  the signature band
│ [═══ window spine ═══]       │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ SL │ DYNASTY DEGENERATES │ │  monogram + league, Archivo
│ │                          │ │
│ │ Mahmoud's Team    ● 87.4 │ │  amber dot = live
│ │ proj 121.2               │ │
│ │ ────────────────────     │ │  win-prob hairline
│ │ Sofa Kings          71.9 │ │
│ │ proj 108.0               │ │
│ │                          │ │
│ │ 6 to play    Open in ↗   │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ YH │ THE WORK LEAGUE     │ │  Yahoo card gets inline swap
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

Cards are ordered by *drama*, not alphabetically: closest margin first, finals
last. A blowout you already won doesn't need to be at the top.

---

## Motion

Almost none, deliberately. Three exceptions:

1. Live dot: 2s opacity pulse, `prefers-reduced-motion` disables it.
2. Score changes: 400ms color flash in turf or flag on the delta, then settle.
3. Left-to-play dots: 200ms fade to stone when a player's game ends.

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
