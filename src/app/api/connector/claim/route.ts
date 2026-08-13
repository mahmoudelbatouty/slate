import { pairingClaimRequest } from "@/connector/pairing";
import { db, dbConfigured } from "@/db/client";
import { createConnectorToken, hashConnectorToken, hashSecret } from "@/lib/connector-auth";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "cache-control": "no-store",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  if (!dbConfigured()) return json({ error: "Not configured" }, 503);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8_192) return json({ error: "Payload too large" }, 413);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const parsed = pairingClaimRequest.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid or expired pairing" }, 422);

  const token = createConnectorToken();
  const { data, error } = await db().rpc("claim_connector_pairing", {
    p_pairing_id: parsed.data.challengeId,
    p_challenge_hash: hashSecret(parsed.data.claimSecret),
    p_token_hash: hashConnectorToken(token),
    p_platform: parsed.data.platform,
    p_dashboard_origin: parsed.data.dashboardOrigin,
  });

  const claimed = data?.[0];
  if (
    error ||
    !claimed ||
    claimed.platform !== parsed.data.platform ||
    claimed.dashboard_origin !== parsed.data.dashboardOrigin
  ) {
    return json({ error: "Invalid or expired pairing" }, 401);
  }

  return json(
    {
      installationId: claimed.installation_id,
      platform: claimed.platform,
      dashboardOrigin: claimed.dashboard_origin,
      token,
    },
    200
  );
}

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: CORS });
}
