"use client";

import { useEffect, useState } from "react";
import { logout } from "@/app/auth-actions";
import { PlatformMark } from "@/components/PlatformMark";
import { useReorder } from "@/components/dashboard/useReorder";
import { displayName, initials, type AccountIdentity } from "@/lib/account";
import { connectionNotice, startPairing } from "@/lib/connector-pairing";
import type { ConnectorStatus, PlatformConnectionStatuses } from "@/lib/connector-status";
import type { Platform } from "@/lib/matchup";
import { NOTIFICATIONS, type NotificationKey } from "@/lib/preferences";

export interface LeagueRow {
  key: string;
  name: string;
  meta: string;
  hidden: boolean;
}

type Tab = "" | "notifs" | "order";

export function AccountSheet({
  identity,
  statuses,
  notice,
  leagueCounts,
  leagues,
  notifications,
  onToggleNotification,
  onToggleHidden,
  onMoveLeague,
  onToast,
  onClose,
}: {
  identity: AccountIdentity;
  statuses: PlatformConnectionStatuses;
  notice?: string;
  leagueCounts: Record<Platform, number>;
  leagues: LeagueRow[];
  notifications: NotificationKey[];
  onToggleNotification: (key: NotificationKey) => void;
  onToggleHidden: (key: string) => void;
  onMoveLeague: (activeKey: string, targetKey: string) => void;
  onToast: (message: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("");
  const [syncing, setSyncing] = useState(false);

  async function resyncAll() {
    setSyncing(true);
    try {
      const response = await fetch("/api/live/sync", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error("sync failed");
      const result = (await response.json()) as { state: string };
      onToast(
        result.state === "synced"
          ? "All platforms synced just now."
          : "Already up to date — Slate synced moments ago."
      );
    } catch {
      onToast("That sync could not run. Slate is still showing the last good data.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section
      id="account-sheet"
      className="flex flex-col gap-4 border-b border-ink-line bg-deep px-[18px] pt-4 pb-[18px]"
      aria-label="Account and connections"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-[11px]">
          <span className="mono grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-ink-line bg-ink-raised text-[11px] text-bone-dim">
            {initials(identity)}
          </span>
          <div className="flex min-w-0 flex-col gap-[3px]">
            <span className="display truncate text-sm leading-tight">{displayName(identity)}</span>
            <span className="mono truncate text-[10px] tracking-[0.08em] text-stone">
              {identity.email ?? ""}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mono shrink-0 cursor-pointer text-[10.5px] tracking-[0.09em] text-bone-dim"
        >
          CLOSE ↑
        </button>
      </div>

      <Connections
        statuses={statuses}
        notice={notice}
        leagueCounts={leagueCounts}
        syncing={syncing}
        onResync={resyncAll}
        onToast={onToast}
      />

      <div className="flex flex-col gap-2 border-t border-ink-line pt-[14px]">
        <Accordion
          label="NOTIFICATIONS"
          open={tab === "notifs"}
          onToggle={() => setTab((value) => (value === "notifs" ? "" : "notifs"))}
        />
        {tab === "notifs" && (
          <div className="overflow-hidden rounded-[5px] border border-ink-line">
            {NOTIFICATIONS.map((setting) => (
              <NotificationRow
                key={setting.key}
                label={setting.label}
                meta={setting.meta}
                on={notifications.includes(setting.key)}
                onToggle={() => onToggleNotification(setting.key)}
              />
            ))}
            <p className="mono border-t border-ink-line px-[13px] py-[10px] text-[9px] leading-relaxed tracking-[0.07em] text-stone">
              SAVED IN THIS BROWSER · DELIVERY IS NOT WIRED UP YET
            </p>
          </div>
        )}

        <Accordion
          label="LEAGUE ORDER & VISIBILITY"
          open={tab === "order"}
          onToggle={() => setTab((value) => (value === "order" ? "" : "order"))}
        />
        {tab === "order" && (
          <LeagueOrder leagues={leagues} onToggleHidden={onToggleHidden} onMove={onMoveLeague} />
        )}

        <form action={logout}>
          <button
            type="submit"
            className="mono flex w-full cursor-pointer items-center justify-center rounded-[4px] border border-flag px-[13px] py-[11px] text-[10.5px] tracking-[0.09em] text-flag"
          >
            SIGN OUT
          </button>
        </form>
      </div>
    </section>
  );
}

function Accordion({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`mono flex cursor-pointer items-center justify-between gap-[10px] rounded-[4px] border bg-ink-raised px-[13px] py-[11px] text-left text-[10.5px] tracking-[0.09em] text-bone ${open ? "border-amber" : "border-ink-line"}`}
    >
      {label}
      <span className="text-stone" aria-hidden>{open ? "↑" : "→"}</span>
    </button>
  );
}

function NotificationRow({
  label,
  meta,
  on,
  onToggle,
}: {
  label: string;
  meta: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-line bg-ink-raised px-[13px] py-3">
      <div className="flex min-w-0 flex-col gap-[3px]">
        <span className="truncate text-[12.5px] font-semibold text-bone">{label}</span>
        <span className="mono truncate text-[9.5px] tracking-[0.07em] text-stone">{meta}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className={`flex h-[21px] w-[38px] shrink-0 cursor-pointer rounded-full border p-[2px] ${on ? "justify-end border-amber bg-amber" : "justify-start border-ink-line bg-transparent"}`}
      >
        <span className={`h-[15px] w-[15px] rounded-full ${on ? "bg-ink" : "bg-stone"}`} />
      </button>
    </div>
  );
}

function LeagueOrder({
  leagues,
  onToggleHidden,
  onMove,
}: {
  leagues: LeagueRow[];
  onToggleHidden: (key: string) => void;
  onMove: (activeKey: string, targetKey: string) => void;
}) {
  const reorder = useReorder({ attribute: "leagueOrderKey", onMove });

  return (
    <div className="flex flex-col gap-[9px]">
      <span className="mono text-[9.5px] tracking-[0.11em] text-stone">
        DRAG TO REORDER · TAP SHOWN TO HIDE
      </span>
      <div className="overflow-hidden rounded-[5px] border border-ink-line">
        {leagues.map((league, index) => (
          <div
            key={league.key}
            data-league-order-key={league.key}
            className={`flex items-center gap-[11px] border-b border-ink-line bg-ink-raised px-[13px] py-[11px] last:border-b-0 ${reorder.draggingKey === league.key ? "opacity-60" : ""} ${reorder.dropTargetKey === league.key && reorder.draggingKey !== league.key ? "outline-1 -outline-offset-1 outline-amber" : ""}`}
          >
            <button
              type="button"
              className="mono cursor-grab touch-none text-[12px] text-stone"
              aria-label={`Reorder ${league.name}. Position ${index + 1} of ${leagues.length}. Drag, or use arrow keys.`}
              onKeyDown={(event) => {
                const target =
                  event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1 : -1;
                if (target < 0 || target >= leagues.length) return;
                event.preventDefault();
                onMove(league.key, leagues[target].key);
              }}
              {...reorder.handleProps(league.key)}
            >
              ⠿
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span
                className={`truncate text-[12.5px] font-semibold ${league.hidden ? "text-stone" : "text-bone"}`}
              >
                {league.name}
              </span>
              <span className="mono truncate text-[9px] tracking-[0.1em] text-stone">{league.meta}</span>
            </div>
            <button
              type="button"
              onClick={() => onToggleHidden(league.key)}
              aria-pressed={league.hidden}
              className={`mono shrink-0 cursor-pointer rounded-[3px] border border-ink-line px-[9px] py-[6px] text-[9px] tracking-[0.11em] ${league.hidden ? "text-stone" : "text-bone"}`}
            >
              {league.hidden ? "HIDDEN" : "SHOWN"}
            </button>
          </div>
        ))}
        {leagues.length === 0 && (
          <p className="px-[13px] py-3 text-xs text-bone-dim">No leagues to order yet.</p>
        )}
      </div>
    </div>
  );
}

function Connections({
  statuses,
  notice,
  leagueCounts,
  syncing,
  onResync,
  onToast,
}: {
  statuses: PlatformConnectionStatuses;
  notice?: string;
  leagueCounts: Record<Platform, number>;
  syncing: boolean;
  onResync: () => void;
  onToast: (message: string) => void;
}) {
  const [sleeper, setSleeper] = useState(statuses.sleeper);
  const [espn, setEspn] = useState(statuses.espn);
  const [pairing, setPairing] = useState<Platform | null>(null);

  useEffect(() => {
    const message = connectionNotice(notice);
    if (!message) return;
    onToast(message);
    const url = new URL(window.location.href);
    url.searchParams.delete("connection");
    window.history.replaceState(window.history.state, "", url);
  }, [notice, onToast]);

  useWaitingForData(sleeper, setSleeper);
  useWaitingForData(espn, setEspn);

  async function connect(platform: "sleeper" | "espn") {
    setPairing(platform);
    try {
      await startPairing(platform);
      const next = await fetchConnectorStatus(platform);
      if (next) {
        if (platform === "sleeper") setSleeper(next);
        else setEspn(next);
      }
      onToast(`${title(platform)} pairing approved. Slate is waiting for its first sync.`);
    } catch (cause) {
      onToast(cause instanceof Error ? cause.message : "Pairing failed.");
    } finally {
      setPairing(null);
    }
  }

  return (
    <div className="flex flex-col gap-[9px]">
      <div className="mono flex items-baseline justify-between gap-[10px]">
        <span className="text-[9.5px] tracking-[0.13em] text-stone">CONNECTIONS</span>
        <button
          type="button"
          onClick={onResync}
          disabled={syncing}
          className="cursor-pointer text-[10px] tracking-[0.09em] text-amber disabled:cursor-wait"
        >
          {syncing ? "SYNCING…" : "RESYNC ALL"}
        </button>
      </div>
      <div className="overflow-hidden rounded-[5px] border border-ink-line">
        <ConnectionRow
          platform="sleeper"
          connected={sleeper.state === "connected"}
          meta={
            sleeper.state === "connected"
              ? `${leagueLabel(leagueCounts.sleeper)} · synced from the browser connector`
              : sleeper.state === "waiting_for_data"
                ? "Paired · waiting for the first capture"
                : "Sign in on Sleeper · no password is stored"
          }
          busy={pairing === "sleeper"}
          onConnect={() => connect("sleeper")}
        />
        <ConnectionRow
          platform="yahoo"
          connected={statuses.yahoo.connected}
          meta={
            statuses.yahoo.connected
              ? `${leagueLabel(leagueCounts.yahoo)} · OAuth token stored encrypted`
              : statuses.yahoo.configured
                ? "Sign in with Yahoo"
                : "Setup needs developer credentials"
          }
          href={
            statuses.yahoo.configured && !statuses.yahoo.connected ? "/api/auth/yahoo/start" : undefined
          }
        />
        <ConnectionRow
          platform="espn"
          connected={espn.state === "connected"}
          meta={
            espn.state === "connected"
              ? `${leagueLabel(leagueCounts.espn)} · synced from the browser connector`
              : espn.state === "waiting_for_data"
                ? "Paired · waiting for the first capture"
                : "Sign in on ESPN · no password or cookie is stored"
          }
          busy={pairing === "espn"}
          onConnect={() => connect("espn")}
        />
      </div>
    </div>
  );
}

function ConnectionRow({
  platform,
  connected,
  meta,
  busy = false,
  onConnect,
  href,
}: {
  platform: Platform;
  connected: boolean;
  meta: string;
  busy?: boolean;
  onConnect?: () => void;
  href?: string;
}) {
  const buttonClass =
    "mono shrink-0 cursor-pointer rounded-[3px] border border-ink-line px-[11px] py-[7px] text-[9.5px] tracking-[0.11em] text-bone disabled:cursor-wait";

  return (
    <div className="flex items-center gap-3 border-b border-ink-line bg-ink-raised px-[13px] py-3 last:border-b-0">
      <PlatformMark platform={platform} variant="mark" size={16} dim={!connected} />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[13px] font-semibold text-bone">{title(platform)}</span>
        <span className="mono truncate text-[9.5px] tracking-[0.07em] text-stone">{meta}</span>
      </div>
      {connected ? (
        <span className="mono flex shrink-0 items-center gap-[6px] text-[9.5px] tracking-[0.11em] text-turf">
          <i className="h-[5px] w-[5px] rounded-full bg-turf" aria-hidden />
          SYNCED
        </span>
      ) : href ? (
        <a className={buttonClass} href={href}>
          CONNECT
        </a>
      ) : onConnect ? (
        <button type="button" className={buttonClass} disabled={busy} onClick={onConnect}>
          {busy ? "CONNECTING…" : "CONNECT"}
        </button>
      ) : (
        <span className="mono shrink-0 text-[9.5px] tracking-[0.11em] text-stone">SETUP NEEDED</span>
      )}
    </div>
  );
}

/** Polls only while a fresh pairing has yet to deliver its first capture. */
function useWaitingForData(status: ConnectorStatus, setStatus: (next: ConnectorStatus) => void) {
  useEffect(() => {
    if (status.state !== "waiting_for_data") return;
    const interval = window.setInterval(async () => {
      const next = await fetchConnectorStatus(status.platform);
      if (!next) return;
      setStatus(next);
      if (next.state === "connected") window.clearInterval(interval);
    }, 3_000);
    return () => window.clearInterval(interval);
  }, [status.state, status.platform, setStatus]);
}

async function fetchConnectorStatus(platform: "sleeper" | "espn"): Promise<ConnectorStatus | null> {
  const response = await fetch(`/api/connector/status?platform=${platform}`, { cache: "no-store" });
  return response.ok ? ((await response.json()) as ConnectorStatus) : null;
}

function leagueLabel(count: number): string {
  return `${count} league${count === 1 ? "" : "s"}`;
}

function title(platform: Platform): string {
  return platform === "espn" ? "ESPN" : platform === "yahoo" ? "Yahoo" : "Sleeper";
}
