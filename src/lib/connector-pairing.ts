/**
 * Browser-connector pairing, client side.
 *
 * The raw connector token never touches the page: Slate mints a short-lived,
 * single-use challenge, the extension claims it directly, and the only thing
 * crossing `postMessage` is that challenge. No password, cookie, or provider
 * token is ever requested here.
 */

export interface PairingChallenge {
  challengeId: string;
  claimSecret: string;
  platform: "sleeper" | "espn";
  dashboardOrigin: string;
  expiresAt: string;
}

interface PairingResult {
  type: "SLATE_PAIR_RESULT";
  requestId: string;
  ok: boolean;
  error?: string;
}

const CLAIM_TIMEOUT_MS = 8_000;

export async function startPairing(platform: "sleeper" | "espn"): Promise<void> {
  const response = await fetch("/api/connector/pair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ platform }),
  });
  const body = (await response.json()) as PairingChallenge & { error?: string };
  if (!response.ok || !body.challengeId || !body.claimSecret) {
    throw new Error(body.error ?? "Pairing failed");
  }
  await claimWithExtension(body);
}

export function claimWithExtension(challenge: PairingChallenge): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Slate Connector was not detected. Open its popup once, approve this dashboard, then try again."
        )
      );
    }, CLAIM_TIMEOUT_MS);

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    }

    function onMessage(event: MessageEvent<unknown>) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const result = event.data as Partial<PairingResult> | null;
      if (result?.type !== "SLATE_PAIR_RESULT" || result.requestId !== requestId) return;
      cleanup();
      if (result.ok) resolve();
      else reject(new Error(result.error ?? "The connector could not claim this pairing."));
    }

    window.addEventListener("message", onMessage);
    window.postMessage({ type: "SLATE_PAIR_REQUEST", requestId, ...challenge }, window.location.origin);
  });
}

export function connectionNotice(notice: string | undefined): string | null {
  switch (notice) {
    case "sleeper-connected": return "Sleeper connected and synced just now.";
    case "espn-connected": return "ESPN connected and synced just now.";
    case "yahoo-connected": return "Yahoo connected. Your leagues are synced.";
    case "yahoo-sync-pending": return "Yahoo connected. League sync will retry automatically.";
    case "yahoo-cancelled": return "Yahoo connection was cancelled.";
    case "yahoo-invalid-state": return "Yahoo connection expired. Please try again.";
    case "yahoo-missing-code":
    case "yahoo-error": return "Yahoo could not be connected. No password or token was retained.";
    case "yahoo-setup-needed": return "Yahoo setup needs developer credentials and a token-encryption key.";
    default: return null;
  }
}
