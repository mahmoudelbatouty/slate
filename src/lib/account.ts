/**
 * The header avatar. Names come from Supabase user metadata, which a person
 * fills in when they create the account and can leave empty forever, so the
 * email has to carry the fallback.
 */

export interface AccountIdentity {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

export function displayName(identity: AccountIdentity): string {
  const name = [identity.firstName, identity.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
  if (name) return name;
  return identity.email?.split("@")[0] ?? "Slate account";
}

export function initials(identity: AccountIdentity): string {
  const first = identity.firstName?.trim()?.[0];
  const last = identity.lastName?.trim()?.[0];
  if (first || last) return `${first ?? ""}${last ?? ""}`.toUpperCase();

  const local = identity.email?.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (local.slice(0, 2) || "—").toUpperCase();
}
