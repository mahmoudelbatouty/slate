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
  const width = variant === "card" ? "w-[58px]" : "w-8";

  if (platform === "sleeper") {
    return (
      <span className={`flex h-[24px] ${width} shrink-0 items-center ${frame}`}>
        <Image
          src={variant === "login"
            ? "https://sleepercdn.com/favicon-42796bbb4386661535d79905a6379e51.ico"
            : "https://sleepercdn.com/landing/web2026/img/logos/logo-full-horizontal-white.png"}
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
