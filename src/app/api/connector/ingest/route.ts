import { dbConfigured, db } from "@/db/client";
import { connectorEnvelope } from "@/connector/protocol";
import { storeConnectorCapture } from "@/connector/store";
import { bearerToken, hashConnectorToken } from "@/lib/connector-auth";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  if (!dbConfigured()) return json({ error: "Not configured" }, 503);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 256_000) return json({ error: "Payload too large" }, 413);

  const token = bearerToken(request);
  if (!token) return json({ error: "Unauthorized" }, 401);

  const { data: installation, error: authError } = await db()
    .from("connector_installations")
    .select("id")
    .eq("token_hash", hashConnectorToken(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (authError || !installation) return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const parsed = connectorEnvelope.safeParse(body);
  if (!parsed.success) return json({ error: "Unsupported connector payload" }, 422);

  try {
    const result = await storeConnectorCapture(installation.id, parsed.data);
    return json({ ok: true, ...result }, 200);
  } catch {
    return json({ error: "Capture could not be stored" }, 500);
  }
}

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: CORS });
}
