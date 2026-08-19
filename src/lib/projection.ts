/**
 * Which projected total to believe.
 *
 * Two numbers describe the same lineup: the browser connector's capture of the
 * provider's own figure, and the sync job's computation from the provider's
 * projected stat line and the league's scoring settings. The capture is the
 * more authoritative of the two — it is literally what the provider shows —
 * but only for the lineup it was captured against.
 *
 * Measured against a real Sleeper league, the computation matches the captured
 * figure to the cent for every team whose lineup has not moved since the
 * capture. The one team that disagreed was the owner's, because they had
 * edited their lineup after the capture: the stale capture kept winning and
 * the card showed a projection 32 points below the lineup on screen.
 *
 * So: the capture wins while it is at least as fresh as the last provider
 * sync, and a capture always wins when Slate could not compute anything (a
 * missing projections host, or a platform whose numbers Slate does not model).
 */
export interface NativeProjection {
  points: number | null;
  capturedAt: string | null;
}

export function preferProjection(
  native: NativeProjection | undefined,
  computed: number | null,
  syncedAt: string | null
): number | null {
  if (!native || native.points === null) return computed;
  if (computed === null) return native.points;
  if (!native.capturedAt || !syncedAt) return native.points;

  const captured = Date.parse(native.capturedAt);
  const synced = Date.parse(syncedAt);
  if (Number.isNaN(captured) || Number.isNaN(synced)) return native.points;

  return captured >= synced ? native.points : computed;
}
