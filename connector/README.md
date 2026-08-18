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
   land on the fantasy welcome page; connector 0.4.1 discovers up to ten leagues
   from ESPN's own visible league links and captures their approved league
   responses. Opening an individual league remains a safe fallback.

Localhost is approved automatically. For another dashboard origin, open the
extension popup once, enter that dashboard URL, and press **Approve dashboard**.
The URL is not a credential; the popup requests access only to that exact
origin. No key or token is copied by the user.

The unified Slate dashboard remains the everyday screen. Provider tabs only
need to be opened or refreshed when their native private data should be synced;
background refresh while every ESPN tab is closed is not yet implemented.

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
- The extension cannot read or modify the Slate database.
- The connector token authorizes only `/api/connector/ingest`.
- Each token is bound to one platform; cross-platform payloads are rejected.
- Server validation rejects unknown platforms, capture kinds, and fields.
- Captured payloads are protected by RLS and accessible only to the server role.
