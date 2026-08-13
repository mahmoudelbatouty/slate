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
4. In Slate, press **Pair** in the Browser Connector panel.
5. Open the extension popup and paste the dashboard URL and the one-time token.
6. Sign into Sleeper normally, open a matchup, then press **Sync open Sleeper tabs**.

The unified Slate dashboard remains the everyday screen. Provider tabs only
need to be opened or refreshed when their native private data should be synced.

## Security boundary

- Provider credentials stay with the provider.
- The extension cannot read or modify the Slate database.
- The connector token authorizes only `/api/connector/ingest`.
- Server validation rejects unknown platforms, capture kinds, and fields.
- Captured payloads are protected by RLS and accessible only to the server role.
