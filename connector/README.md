# Slate Fantasy Connector

The connector is a Manifest V3 browser extension. It never reads password
fields, cookies, local storage, or request headers. It observes only approved
fantasy responses, removes every field outside the allowlist, and sends that
sanitized data to Slate with a revocable, platform-scoped ingest token. Sleeper
capture is implemented. ESPN pairing, sign-in, strict league capture, automatic
league discovery, and canonical ingestion are implemented but still require
real-account validation.

## Install for development

1. Open `chrome://extensions` in Chrome or Edge.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `connector/` directory.
4. Reload the extension after pulling connector changes.
5. Open Slate and press the Sleeper or ESPN logo.
6. Sign into that provider normally. For Sleeper, open a matchup. For ESPN,
   land on the fantasy welcome page; connector 0.5.1 discovers up to ten leagues
   from ESPN's own visible league links and captures their approved league
   responses. Opening an individual league remains a safe fallback.

Localhost is approved automatically. For another dashboard origin, open the
extension popup once, enter that dashboard URL, and press **Approve dashboard**.
The URL is not a credential; the popup requests access only to that exact
origin. No key or token is copied by the user.

The unified Slate dashboard remains the everyday screen. After the first ESPN
discovery, Chromium can close every ESPN tab: the connector refreshes the saved
numeric league references every five minutes, or every minute during the live
NFL window reported by Slate. Chromium must remain open and the user's normal
ESPN session must remain valid.

Pairing records the originating Slate tab as a one-time return target. The
provider opens in the same browser, and only after Slate confirms a sanitized
capture was stored does the connector focus and refresh that Slate tab with a
provider-specific success message. A login alone never produces a success
state. The provider tab stays available in the background for troubleshooting.

## Pairing security

- Slate creates a random pairing challenge that expires after five minutes.
- The installed extension claims it once through the active Slate page.
- Each long-lived ingest token is returned only to the extension and stored by
  platform in extension-local storage. Connecting ESPN cannot replace the
  Sleeper connection, and tokens are never rendered into the dashboard.
- Postgres stores only hashes of both the challenge secret and ingest token.
- Replaying a consumed or expired challenge fails closed.

## Data security boundary

- Provider credentials stay with the provider.
- ESPN background requests rely on the browser-managed session but never read,
  store, log, or transmit cookie values.
- Only numeric ESPN league/team/season references are retained locally, capped
  at ten leagues, and every request is constructed against the exact approved
  ESPN league-read host and path.
- The extension cannot read or modify the Slate database.
- The connector token authorizes only `/api/connector/ingest`.
- Each token is bound to one platform; cross-platform payloads are rejected.
- Server validation rejects unknown platforms, capture kinds, and fields.
- Captured payloads are protected by RLS and accessible only to the server role.
