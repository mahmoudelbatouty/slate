import type { MatchupPlayer } from "./matchup";

/** Selected-week game state for one fantasy player, using provider game data. */
export function playerGameLabel(player: Pick<MatchupPlayer, "game">): string {
  const game = player.game;
  if (!game) return "BYE / TBD";
  if (game.canceled) return "CANCELED";
  if (game.isOver) return game.opponent ? `PLAYED · vs ${game.opponent}` : "PLAYED";
  if (game.inProgress) return game.quarter ? `LIVE ${game.quarter}` : "LIVE";
  if (!game.startTime) return game.opponent ? `TO PLAY · vs ${game.opponent}` : "BYE / TBD";

  const date = new Date(game.startTime);
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "America/New_York",
  }).format(date).toUpperCase();
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(date);
  return `TO PLAY${game.opponent ? ` · vs ${game.opponent}` : ""} · ${day} ${time}`;
}
