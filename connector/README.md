# Slate Fantasy Connector

The connector is a Manifest V3 browser extension. It never reads password
fields, cookies, local storage, or request headers. On Sleeper it observes only
the response to approved `matchup_legs` GraphQL operations, removes every field
outside the allowlist, and sends that sanitized data to Slate with a revocable,
ingest-only token.

## Install for development

1. Open `chrome://extensions` in Chrome or Edge.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `connector/` directory.
4. Reload the extension after pulling connector changes.
5. Open Slate and press **Connect Sleeper**.
6. Sign into Sleeper normally and open a matchup when the connector opens it.

Localhost is approved automatically. For another dashboard origin, open the
extension popup once, enter that dashboard URL, and press **Approve dashboard**.
The URL is not a credential; the popup requests access only to that exact
origin. No key or token is copied by the user.

The unified Slate dashboard remains the everyday screen. Provider tabs only
need to be opened or refreshed when their native private data should be synced.

## Pairing security

- Slate creates a random pairing challenge that expires after five minutes.
- The installed extension claims it once through the active Slate page.
- The long-lived ingest token is returned only to the extension and stored in
  extension-local storage. It is never rendered into the dashboard.
- Postgres stores only hashes of both the challenge secret and ingest token.
- Replaying a consumed or expired challenge fails closed.

## Data security boundary

- Provider credentials stay with the provider.
- The extension cannot read or modify the Slate database.
- The connector token authorizes only `/api/connector/ingest`.
- Server validation rejects unknown platforms, capture kinds, and fields.
- Captured payloads are protected by RLS and accessible only to the server role.
