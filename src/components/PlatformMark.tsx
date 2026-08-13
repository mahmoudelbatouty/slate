import Image from "next/image";
import { MONOGRAM, type Platform } from "@/lib/matchup";

/** Shared by collapsed and expanded matchup headers across every provider. */
export function PlatformMark({ platform }: { platform: Platform }) {
  if (platform === "sleeper") {
    return (
      <span className="flex h-[24px] w-[58px] shrink-0 items-center border border-ink-line px-[5px]">
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
    <span
      className="mono shrink-0 border border-ink-line px-[6px] py-[3px] text-2xs tracking-[0.05em] text-bone-dim"
      aria-label={platform === "espn" ? "ESPN" : "Yahoo"}
    >
      {MONOGRAM[platform]}
    </span>
  );
}
