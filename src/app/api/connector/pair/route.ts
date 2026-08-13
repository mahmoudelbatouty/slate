import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@/lib/auth";
import { dbConfigured, db } from "@/db/client";
import { pairingRequest, PAIRING_TTL_MS } from "@/connector/pairing";
import { createPairingSecret, hashSecret } from "@/lib/connector-auth";

export async function POST(request: Request) {
  if (!dbConfigured()) {
    return Response.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = pairingRequest.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Unsupported platform" }, { status: 422 });

  const authCookie = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!authCookie) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const claimSecret = createPairingSecret();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + PAIRING_TTL_MS);
  const dashboardOrigin = requestOrigin(request);

  const { data, error } = await db()
    .from("connector_pairing_challenges")
    .insert({
      platform: parsed.data.platform,
      dashboard_origin: dashboardOrigin,
      challenge_hash: hashSecret(claimSecret),
      session_hash: hashSecret(authCookie),
      created_at: createdAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (error) return Response.json({ error: "Could not start pairing" }, { status: 500 });
  return Response.json(
    {
      challengeId: data.id,
      claimSecret,
      platform: parsed.data.platform,
      dashboardOrigin,
      expiresAt: expiresAt.toISOString(),
    },
    { headers: { "cache-control": "no-store" } }
  );
}

function requestOrigin(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin) {
    const parsed = new URL(origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.origin;
  }
  return new URL(request.url).origin;
}
