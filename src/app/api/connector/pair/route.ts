import { dbConfigured, db } from "@/db/client";
import { createConnectorToken, hashConnectorToken } from "@/lib/connector-auth";

export async function POST() {
  if (!dbConfigured()) {
    return Response.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const token = createConnectorToken();
  const { data, error } = await db()
    .from("connector_installations")
    .insert({ token_hash: hashConnectorToken(token) })
    .select("id")
    .single();

  if (error) return Response.json({ error: "Could not create connector" }, { status: 500 });
  return Response.json({ installationId: data.id, token });
}
