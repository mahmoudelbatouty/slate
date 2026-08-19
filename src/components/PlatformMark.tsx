import Image from "next/image";
import type { Platform } from "@/lib/matchup";

const SLEEPER_ICON = "https://sleepercdn.com/favicon-42796bbb4386661535d79905a6379e51.ico";

/**
 * The square provider icon, shared by card headers, the connections list, the
 * header status row, and the sign-in board.
 *
 * Marks keep their official colors in both themes — they are never recolored
 * to encode game state, which is amber, turf, and flag's job. Yahoo's purple
 * is the one mark too dark to read on Floodlight's ground, so it carries a
 * luminance lift (see `.platform-mark-image--lift` in globals.css).
 */
export function PlatformMark({
  platform,
  size = 16,
  dim = false,
}: {
  platform: Platform;
  size?: number;
  dim?: boolean;
}) {
  const alt = platform === "espn" ? "ESPN" : platform === "yahoo" ? "Yahoo" : "Sleeper";
  const shape = platform === "sleeper" ? "rounded-[3px]" : "platform-mark-image";
  const lift = platform === "yahoo" ? "platform-mark-image--lift" : "";

  return (
    <Image
      src={platform === "sleeper" ? SLEEPER_ICON : `/brands/${platform}-mark.svg`}
      alt={alt}
      width={size}
      height={size}
      className={`shrink-0 object-contain ${shape} ${lift} ${dim ? "opacity-60" : ""}`}
      style={{ width: size, height: size }}
      unoptimized={platform === "sleeper"}
    />
  );
}
