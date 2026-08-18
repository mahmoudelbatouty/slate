# Credential and connection policy

**Status: proposed amendment. Not yet adopted.** `CLAUDE.md` still forbids
storing provider session material and still describes Sleeper connection as
connector-first. Nothing in this file is implemented. Adopt or reject it
deliberately, then reconcile `CLAUDE.md` in the same change — do not leave the
two documents disagreeing.

This file exists because Slate's goal changed: personal use first, then every
user, with the smallest possible install burden. That goal cannot be met for
private ESPN leagues under the original rule. This document says what replaces
it and what stays fixed.

---

## 1. The model: pair once, sync forever

The original design treated the browser connector as **infrastructure** — it had
to be installed and running for data to stay fresh. That is what forced "leave
Chrome open on Sunday" and broke the phone experience.

The corrected model treats it as **one-time credential acquisition**:

```
  pair once  ──→  encrypted secret in Postgres  ──→  server-side sync forever
  (per platform,      (never leaves the              (cron + live refresh;
   provider-hosted     server after this)             phone works, nothing
   login)                                             installed or running)
```

Consequences that make this worth doing:

- **No laptop stays open.** Syncs run server-side on schedule, exactly as
  Sleeper and Yahoo already do.
- **The phone works.** After pairing, the capture mechanism is irrelevant to
  daily use. The dashboard reads Postgres and always did.
- **The install, where one is needed at all, is onboarding — not runtime.**

This is the same architecture FantasyPros uses: a browser extension on desktop,
a native app on mobile, an encrypted ESPN cookie on their servers, and periodic
server-side syncing thereafter. It is the industry-standard answer rather than a
shortcut, and that extension clears Chrome Web Store review.

---

## 2. Non-negotiables

These survive the amendment. Nothing below softens them.

1. **Slate never accepts, transmits, logs, or stores a provider password.** No
   flow being contemplated requires one. Any design that asks for a provider
   password is rejected outright, however it would be stored.
2. **The user always authenticates on the provider's own page.** Provider login
   is never rendered inside a Slate-styled form.
3. **Slate never asks a user to copy a cookie, token, or header by hand.** No
   devtools instructions, no paste boxes. That flow trains users to hand session
   material to whatever asks for it, which is how phishing succeeds. Capture is
   automatic or it does not happen.
4. **Least privilege per platform.** Where a scoped, revocable grant exists it is
   used, and session capture is forbidden. Capturing Yahoo cookies when Yahoo
   offers OAuth would be strictly worse and is not permitted.
5. **Capture only what the chosen mechanism requires.** The allowlisted-adapter
   rule stands: the extension must not become a generic request proxy or script
   runner, and it reads only what a named, reviewed operation needs.
6. **A stored secret is decrypted only server-side, inside a sync job.** Never
   sent to a client, never rendered, never placed in a URL, never written to a
   `sync_runs` row or any log line.

---

## 3. Per-platform ladder — the least friction that works

Each platform uses the **cheapest mechanism that actually reaches the data.** A
user is never asked for more than their situation requires.

| Platform | Data | Mechanism | Install | Secret stored |
|---|---|---|---|---|
| **Sleeper** | all reads | public API via username to numeric `user_id` | none | **none** |
| **Sleeper** | lineup writes | session token, captured by pairing | one-time | session token |
| **Yahoo** | reads + writes | official OAuth, S256 PKCE | none | OAuth refresh token |
| **ESPN** | public leagues | league ID, public read API | none | **none** |
| **ESPN** | private leagues | `espn_s2` / `SWID`, captured by pairing | one-time | session cookies |

Two points shape the whole product:

- **Sleeper needs no secret at all for the entire dashboard experience.** Its API
  is public and unauthenticated. Only writes need a token, and writes are a later
  milestone. Sleeper ships zero-install and zero-secret.
- **Yahoo is the only platform that is complete with no install** — reads and
  writes, on a phone. It keeps OAuth and never uses capture.

---

## 4. What the web user actually experiences

The requirement: a browser-only user gets as far as possible with **no install
and no secret**, and is asked for more only when their own situation demands it.

### Connect flow, in the order the user meets it

1. **Sleeper — type a username, done.** One field. The server resolves the public
   numeric ID and imports every league. No install, no secret, works on a phone.
   The connector may still offer one-click discovery as a convenience, but it is
   never required and never the only path shown.
2. **Yahoo — one button, provider consent.** Standard OAuth redirect to Yahoo's
   own consent page and back. No install.
3. **ESPN — league ID first.** Ask for the league and try the public read. If the
   league is publicly viewable it syncs immediately, with no install and no
   secret. Many leagues qualify.
4. **ESPN private — explain, then offer pairing.** Only when the public read
   fails does Slate say the league is private and offer one-time pairing. Before
   anything is installed, the screen states:
   - what will be stored (an ESPN session cookie, encrypted),
   - what it allows (full access to that ESPN account),
   - that no password is involved and sign-in happens on ESPN,
   - that it can be disconnected at any time, and how,
   - that a commissioner can instead make the league viewable, removing the need
     entirely.

### Rules for that experience

- **Never lead with the install.** It appears only after the free paths are
  exhausted, and only for the league that needs it.
- **Per-league honesty.** A user with two public ESPN leagues and one private one
  syncs two immediately and is asked about one. Never all-or-nothing.
- **Pairing returns the user where they started**, and success appears only after
  Slate confirms real ingestion. Provider login alone is never success. This rule
  already exists and continues to hold.
- **Degradation is visible, not silent.** An expired secret shows a reconnect
  state for that platform with a "last synced" time. Other platforms and the
  dashboard keep working.
- **Disconnect is one click**, deletes the secret immediately, and hides data
  without deleting synced records — matching existing sign-out behavior.

### Capture mechanisms, in preference order

1. **Public or unauthenticated path** — always preferred; no capture at all.
2. **Official OAuth** — wherever the provider offers it.
3. **Browser extension** — desktop, one-time, provider-hosted login.
4. **Thin native app** — the only way to offer one-time pairing on a phone, and
   what FantasyPros ships for exactly this reason. Out of scope for now, recorded
   so the decision stays deliberate rather than forgotten.

A web page can never perform the capture itself: `HttpOnly` blocks script access
to cookies and the same-origin policy blocks cross-origin reads. That is a
browser security guarantee, not a gap to engineer around. Any future proposal
claiming a pure-web private-ESPN sync is mistaken and should be rejected on
sight.

---

## 5. Storing the secret

Holding other people's session material is the part that can go badly wrong. The
requirements below are the price of adopting this amendment.

### Encryption

- **AES-256-GCM envelope encryption**, reusing `src/lib/token-crypto.ts`. Its
  format is already versioned (`v1.iv.ciphertext.tag`), which is what makes
  rotation possible without guesswork.
- **The master key lives only in the deployment environment**
  (`PLATFORM_TOKEN_ENCRYPTION_KEY`) — never in Postgres, never in the repo, never
  in a log or an error message.
- **Per-record data keys** once this is multi-user: generate a random data key
  per stored secret, encrypt the secret with it, encrypt that data key with the
  master key. One recovered ciphertext then does not imply a universal decrypt,
  and rotation becomes re-wrapping keys rather than re-encrypting every secret.
- **Plan rotation before you need it.** Version tags let old and new keys
  coexist. Write the runbook while nothing is on fire.

### Storage and access

- Secrets live in `platform_accounts.secrets`, owner-scoped, with `anon` and
  `authenticated` revoked. Service role only. This pattern already protects the
  Yahoo refresh token and must not be loosened.
- **Decryption happens only inside server-side sync code.** Never in a Server
  Component that renders, never in a route that echoes state, never in a client
  bundle. Putting a secret in a React prop is a defect, not a style question.
- **Log the use, never the value.** Record that a secret was used, for which
  owner and platform, and whether it worked. Never the ciphertext, never a
  prefix, never a length that narrows it.
- **Error paths redact by default.** Provider errors often echo the request;
  scrub before anything reaches `sync_runs` or a log sink.

### Blast radius and operational hygiene

Required before any secret belonging to someone other than the repo owner is
stored:

- **2FA on GitHub, Vercel, and Supabase.** Otherwise the master key is one
  dashboard login away from an attacker.
- **The service-role key is as sensitive as the master key** — it reads every
  secret row. Treat leaking it as equivalent to leaking the key.
- **Dependency discipline.** A malicious postinstall script in any dependency
  runs where the key is readable. Pin versions, review additions, keep the
  dependency surface small.
- **Write the incident runbook in advance:** rotate the master key, invalidate
  every stored secret, force re-pairing, and tell affected users their fantasy
  session was exposed and should be signed out everywhere. Decide who does what
  before it is needed.
- **Keep the risk statement honest.** An `espn_s2` cookie is full account access
  for roughly a year. It cannot be scoped down and cannot be revoked without a
  password change. Encryption at rest defends against a database leak; it does
  not defend against compromise of the running application, which must decrypt to
  work. Never describe a stored cookie to users as harmless because it is opaque.

### Expiry

- A rejected secret marks the platform account stale, writes a `sync_runs`
  failure, and surfaces a reconnect banner. It never throws, never breaks another
  platform, and never deletes synced data.
- Prefer proactive detection: after two consecutive auth failures, mark stale
  rather than retrying indefinitely against the provider.

---

## 6. Reconciling `CLAUDE.md` when this is adopted

These statements currently contradict this file and must change together:

- "Provider passwords and cookies never enter Slate" → passwords never; session
  cookies only under this policy, encrypted, and only for platforms with no
  alternative.
- "the connector discovers the signed-in account's public numeric user ID. No
  username entry is required" → username entry becomes the primary Sleeper path.
- M6's framing of the connector as *the* ESPN path → one of several, and the last
  resort.
- "Single user for the current prototype" → multi-user is now the stated goal,
  which is what triggers the hardening requirements in section 5.
- The definition of done should state the ESPN private-league limitation rather
  than implying full coverage.

---

## 7. Open decisions

1. **Adopt this at all?** Staying credential-free means public ESPN leagues only.
   That is a defensible product with zero liability.
2. **Native app for phone pairing?** Required to match FantasyPros' mobile UX.
   Significant scope.
3. **Sleeper writes** need a session token and therefore fall under this policy.
   The write itself is already reverse-engineered on
   `codex/sleeper-write-recorder`.
4. **Chrome Web Store publication** — needed before any non-developer can use the
   extension. The current `https://*/*` optional host permission and the
   user-typed dashboard URL should be narrowed first.
