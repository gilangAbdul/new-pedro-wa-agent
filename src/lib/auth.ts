import crypto from "crypto";

const SECRET = process.env.SESSION_SECRET || "ganti_secret_ini";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function createSessionCookieValue(): string {
  const payload = Date.now().toString();
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function isValidSessionCookie(value: string | undefined): boolean {
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  if (sign(payload) !== signature) return false;
  const issuedAt = parseInt(payload, 10);
  if (isNaN(issuedAt)) return false;
  return Date.now() - issuedAt < MAX_AGE_MS;
}