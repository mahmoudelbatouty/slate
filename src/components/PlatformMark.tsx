import Image from "next/image";
import type { Platform } from "@/lib/matchup";

/**
 * The square provider icon, shared by card headers, the connections list, the
 * header status row, and the sign-in board.
 *
 * All three marks are bundled. Nothing here reaches a platform's CDN: a page
 * render touches no provider host, which is the same rule the data path
 * follows, and the marks then survive an offline or filtered network instead
 * of leaving one blank square among three.
 *
 * Marks keep their official colors in both themes — they are never recolored
 * to encode game state, which is amber, turf, and flag's job. Yahoo's purple
 * is the one mark too dark to read on Floodlight's ground, so it carries a
 * luminance lift (see `.platform-mark-image--lift` in globals.css).
 */
const SOURCES: Record<Platform, { src: string; alt: string }> = {
  sleeper: { src: "/brands/sleeper-mark.png", alt: "Sleeper" },
  yahoo: { src: "/brands/yahoo-mark.svg", alt: "Yahoo" },
  espn: { src: "/brands/espn-mark.svg", alt: "ESPN" },
};

export function PlatformMark({
  platform,
  size = 16,
  dim = false,
}: {
  platform: Platform;
  size?: number;
  dim?: boolean;
}) {
  const { src, alt } = SOURCES[platform];
  // Sleeper's mark is a filled tile rather than a bare glyph, so it keeps the
  // corner radius its own artwork is drawn with.
  const shape = platform === "sleeper" ? "rounded-[3px]" : "platform-mark-image";
  const lift = platform === "yahoo" ? "platform-mark-image--lift" : "";

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`shrink-0 object-contain ${shape} ${lift} ${dim ? "opacity-60" : ""}`}
      style={{ width: size, height: size }}
    />
  );
}
