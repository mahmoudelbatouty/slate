import { getConnectorStatus } from "@/lib/connector-status";

export async function GET() {
  const status = await getConnectorStatus();
  return Response.json(status, { headers: { "cache-control": "no-store" } });
}
