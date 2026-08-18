import { getConnectorStatus } from "@/lib/connector-status";
import { currentUser } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const requested = new URL(request.url).searchParams.get("platform");
  const platform = requested === "espn" ? "espn" : "sleeper";
  const status = await getConnectorStatus(user.id, platform);
  return Response.json(status, { headers: { "cache-control": "no-store" } });
}
