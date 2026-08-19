# Provider marks

Local provider marks used by the shared `PlatformMark` component — card
headers, the connections list, the header status row, and the sign-in board.

- `yahoo.svg` — Yahoo corporate wordmark sourced from Yahoo Inc.'s official
  website asset on 2026-08-13.
- `espn.svg` — ESPN wordmark paths extracted from ESPN Press Room's official
  logo asset on 2026-08-13.
- `yahoo-mark.svg` and `espn-mark.svg` — compact crops of those same official
  assets for the header login control.
- `sleeper-mark.png` — Sleeper's official site icon, sourced from
  `sleepercdn.com` on 2026-08-18 and bundled here. The source is a multi-size
  `.ico`; this is its largest frame (48×48) re-encoded as PNG. It replaced a
  hot-link to a content-hashed CDN filename, which broke offline and 404s
  whenever Sleeper rotates the hash.

These marks identify their respective providers only. Do not recolor them to
encode matchup state, and do not replace them with user-supplied remote URLs.
Keep them local: nothing in a page render should reach a provider's host.
