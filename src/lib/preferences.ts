/**
 * Account preferences that only affect this reader's view: which alerts they
 * want and which leagues they hide. Both live in browser storage, exactly like
 * the saved card order — nothing here changes what Slate syncs, so there is no
 * reason to make a round trip for it.
 */

export const NOTIFICATION_STORAGE_KEY = "slate.notifications.v1";
export const HIDDEN_LEAGUES_STORAGE_KEY = "slate.hidden-leagues.v1";

export type NotificationKey = "close" | "lineup" | "chop" | "injury" | "recap";

export interface NotificationSetting {
  key: NotificationKey;
  label: string;
  meta: string;
}

export const NOTIFICATIONS: NotificationSetting[] = [
  { key: "close", label: "Close game alerts", meta: "Within 10 points in the last hour" },
  { key: "lineup", label: "Lineup not set", meta: "Sunday 11:30 AM, empty slots only" },
  { key: "chop", label: "Survival chop zone", meta: "When you drop into the bottom two" },
  { key: "injury", label: "Injury on a starter", meta: "Status changes after Friday" },
  { key: "recap", label: "Weekly recap", meta: "Tuesday morning, all leagues" },
];

export const DEFAULT_NOTIFICATIONS: NotificationKey[] = ["close", "lineup", "chop"];

const NOTIFICATION_KEYS = new Set<string>(NOTIFICATIONS.map((setting) => setting.key));

/** Unknown keys are dropped so a stale build can't switch on an alert we removed. */
export function parseNotifications(value: string | null): NotificationKey[] {
  const parsed = parseStringArray(value);
  if (parsed === null) return DEFAULT_NOTIFICATIONS;
  return parsed.filter((key): key is NotificationKey => NOTIFICATION_KEYS.has(key));
}

export function parseHiddenLeagues(value: string | null): string[] {
  return parseStringArray(value) ?? [];
}

export function toggle<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

export function serialize(keys: readonly string[]): string {
  return JSON.stringify({ version: 1, keys });
}

function parseStringArray(value: string | null): string[] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const keys = (parsed as { version?: unknown; keys?: unknown }).keys;
    if ((parsed as { version?: unknown }).version !== 1 || !Array.isArray(keys)) return null;
    return [...new Set(keys.filter((key): key is string => typeof key === "string"))].slice(0, 500);
  } catch {
    return null;
  }
}
