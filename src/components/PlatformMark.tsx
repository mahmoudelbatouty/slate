import Image from "next/image";
import type { Platform } from "@/lib/matchup";

const SLEEPER_ICON = "https://sleepercdn.com/favicon-42796bbb4386661535d79905a6379e51.ico";
const SLEEPER_WORDMARK =
  "https://sleepercdn.com/landing/web2026/img/logos/logo-full-horizontal-white.png";

/**
 * Shared by card headers, the connections list, and the header status row.
 *
 * `mark` is the square provider icon the new shell uses everywhere a league is
 * identified; `card` keeps the framed wordmark for wider surfaces. Marks are
 * never recolored to encode game state — that is amber, turf, and flag's job.
 */
export function PlatformMark({
  platform,
  variant = "card",
  size = 16,
  dim = false,
}: {
  platform: Platform;
  variant?: "card" | "login" | "mark";
  size?: number;
  dim?: boolean;
}) {
  if (variant === "mark") {
    const alt = platform === "espn" ? "ESPN" : platform === "yahoo" ? "Yahoo" : "Sleeper";
    return (
      <Image
        src={platform === "sleeper" ? SLEEPER_ICON : `/brands/${platform}-mark.svg`}
        alt={alt}
        width={size}
        height={size}
        className={`shrink-0 object-contain ${platform === "sleeper" ? "rounded-[3px]" : "platform-mark-image"} ${dim ? "opacity-60" : ""}`}
        style={{ width: size, height: size }}
        unoptimized={platform === "sleeper"}
      />
    );
  }

  const frame = variant === "card" ? "border border-ink-line px-[5px]" : "px-1";
  const width = variant === "card" ? "w-[58px]" : "w-8";

  if (platform === "sleeper") {
    return (
      <span className={`flex h-[24px] ${width} shrink-0 items-center ${frame}`}>
        <Image
          src={variant === "login" ? SLEEPER_ICON : SLEEPER_WORDMARK}
          alt="Sleeper"
          width={variant === "login" ? 24 : 94}
          height={24}
          className={variant === "login" ? "h-6 w-6" : "platform-mark-image h-auto w-full"}
        />
      </span>
    );
  }

  return (
    <span className={`flex h-[24px] ${width} shrink-0 items-center ${frame}`}>
      <Image
        src={`/brands/${platform}${variant === "login" ? "-mark" : ""}.svg`}
        alt={platform === "espn" ? "ESPN" : "Yahoo"}
        width={platform === "espn" ? (variant === "login" ? 114 : 456) : (variant === "login" ? 34 : 100)}
        height={platform === "espn" ? 113 : 28}
        className={variant === "login" ? "h-6 w-6 object-contain" : "h-auto w-full"}
      />
    </span>
  );
}
