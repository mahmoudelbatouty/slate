import { z } from "zod";

export type AuthIntent = "signin" | "signup" | "resend" | "reset";

export type AuthSubmission = {
  intent: AuthIntent;
  email: string;
  password: string;
  next: string;
  /** Optional display name, collected only when creating an account. */
  firstName: string;
  lastName: string;
};

const NAME_MAX = 60;

const schema = z.object({
  intent: z.enum(["signin", "signup", "resend", "reset"]),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string(),
  next: z.string(),
  firstName: z.string().trim().max(NAME_MAX).default(""),
  lastName: z.string().trim().max(NAME_MAX).default(""),
});

/** Only same-origin paths survive, so `?next=` can never bounce a session off-site. */
export function safeDestination(value: unknown): string {
  const path = String(value ?? "/");
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

/** Intents that carry a password the user is choosing or proving. */
const NEEDS_PASSWORD = new Set<AuthIntent>(["signin", "signup"]);

/**
 * Validates one login-form submission. Resend and reset carry no password, so
 * the minimum-length rule applies only to the intents that actually set one.
 */
export function parseAuthSubmission(
  formData: Pick<FormData, "get">
): { ok: true; value: AuthSubmission } | { ok: false; message: string; email?: string } {
  const parsed = schema.safeParse({
    intent: formData.get("intent"),
    email: formData.get("email"),
    password: formData.get("password") ?? "",
    next: String(formData.get("next") ?? "/"),
    firstName: String(formData.get("firstName") ?? "").slice(0, NAME_MAX),
    lastName: String(formData.get("lastName") ?? "").slice(0, NAME_MAX),
  });

  if (!parsed.success) return { ok: false, message: "Enter a valid email address." };

  const value = { ...parsed.data, next: safeDestination(parsed.data.next) };
  if (NEEDS_PASSWORD.has(value.intent) && value.password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters.", email: value.email };
  }
  return { ok: true, value };
}
