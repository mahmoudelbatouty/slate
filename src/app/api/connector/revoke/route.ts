import { z } from "zod";
import { dbConfigured, db } from "@/db/client";

const requestBody = z.object({ installationId: z.uuid() });

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
  const parsed = requestBody.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid installation" }, { status: 422 });

  const { error } = await db()
    .from("connector_installations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.installationId);
  if (error) return Response.json({ error: "Could not disconnect" }, { status: 500 });

  return Response.json({ ok: true });
}
