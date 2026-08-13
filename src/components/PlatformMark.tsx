import Image from "next/image";
import type { Platform } from "@/lib/matchup";

/** Shared by matchup headers and the compact provider-login control. */
export function PlatformMark({
  platform,
  variant = "card",
}: {
  platform: Platform;
  variant?: "card" | "login";
}) {
  const frame = variant === "card" ? "border border-ink-line px-[5px]" : "px-1";
  const width = variant === "card" ? "w-[58px]" : "w-11";

  if (platform === "sleeper") {
    return (
      <span className={`flex h-[24px] ${width} shrink-0 items-center ${frame}`}>
        <Image
          src="https://sleepercdn.com/landing/web2026/img/logos/logo-full-horizontal-white.png"
          alt="Sleeper"
          width={94}
          height={24}
          className="platform-mark-image h-auto w-full"
        />
      </span>
    );
  }

  return (
    <span className={`flex h-[24px] ${width} shrink-0 items-center ${frame}`}>
      <Image
        src={`/brands/${platform}.svg`}
        alt={platform === "espn" ? "ESPN" : "Yahoo"}
        width={platform === "espn" ? 456 : 100}
        height={platform === "espn" ? 113 : 28}
        className="h-auto w-full"
      />
    </span>
  );
}
