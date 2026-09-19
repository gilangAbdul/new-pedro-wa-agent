const SECRET = process.env.SESSION_SECRET || "gilang";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

async function sign(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(SECRET);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionCookieValue(): Promise<string> {
  const payload = Date.now().toString();
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export async function isValidSessionCookie(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  const expectedSignature = await sign(payload);
  if (expectedSignature !== signature) return false;
  const issuedAt = parseInt(payload, 10);
  if (isNaN(issuedAt)) return false;
  return Date.now() - issuedAt < MAX_AGE_MS;
}