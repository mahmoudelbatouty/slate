import { getConnectorStatus } from "@/lib/connector-status";

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("platform");
  const platform = requested === "espn" ? "espn" : "sleeper";
  const status = await getConnectorStatus(platform);
  return Response.json(status, { headers: { "cache-control": "no-store" } });
}
