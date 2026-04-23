const DEFAULT_ADMIN_EMAILS = ["chakshuvinayjain@gmail.com"];

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function getAllowedAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAIL_ALLOWLIST ?? "";
  const envEmails = raw
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);

  if (envEmails.length) return envEmails;
  return DEFAULT_ADMIN_EMAILS;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  return getAllowedAdminEmails().includes(normalized);
}

export function getAccessAuthenticatedEmailFromHeaders(headersLike: Headers): string | null {
  const candidates = [
    headersLike.get("cf-access-authenticated-user-email"),
    headersLike.get("CF-Access-Authenticated-User-Email"),
    headersLike.get("x-auth-request-email"),
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim()) return candidate.trim();
  }

  return null;
}
