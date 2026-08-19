# Slate design handoff

- `design_updated.md` — the spec. Tokens, layout, every card state, interactions, and app state. Self-sufficient; start here.
- `slate-app-shell.html` — logged-in home prototype. Open in a browser. Everything is interactive: week dropdown, ticker (hover pauses, tap jumps to a card), all card expansions, account sheet, theme toggle, CONNECT / RETRY SYNC. Resize past 1000px for the desktop two-column layout. The footer "DEMO STATE" row is prototype scaffolding, not part of the design.
- `slate-sign-in.html` — sign-in / create-account prototype, including the name fields that feed the account initials.

These are **design references**, not production code — recreate them in the app's existing framework and component patterns. The Sleeper logo loads from sleepercdn.com, so it only appears when online; bundle it locally in the real app. ESPN and Yahoo marks are in `brands/`.
