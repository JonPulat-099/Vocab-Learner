/**
 * Telegram identity verification for the web app.
 *
 * Two signed payload flavours share one endpoint:
 * - Mini App `initData` (app opened inside Telegram): HMAC key is
 *   HMAC_SHA256("WebAppData", bot_token).
 * - Login Widget payload (plain browser): HMAC key is SHA256(bot_token).
 *
 * Both sign the same "data-check-string": all fields except `hash`,
 * sorted alphabetically, joined as `key=value` lines.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { TelegramLoginPayload } from "@vocab/shared";

export interface VerifiedTelegramUser {
  tg_id: number;
  username?: string;
  first_name?: string;
}

export type VerifyResult =
  | { ok: true; user: VerifiedTelegramUser }
  | { ok: false; reason: "bad_hash" | "expired" | "malformed" };

/** Signed payloads older than this are rejected (replay protection). */
export const AUTH_MAX_AGE_S = 24 * 60 * 60;

function safeEqualHex(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(actual, "hex");
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function isFresh(authDate: number, nowMs: number): boolean {
  return Number.isFinite(authDate) && nowMs / 1000 - authDate <= AUTH_MAX_AGE_S;
}

export function verifyLoginWidget(
  payload: TelegramLoginPayload,
  botToken: string,
  nowMs: number = Date.now(),
): VerifyResult {
  const { hash, ...fields } = payload;
  const dataCheckString = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!safeEqualHex(expected, hash)) return { ok: false, reason: "bad_hash" };
  if (!isFresh(payload.auth_date, nowMs)) return { ok: false, reason: "expired" };
  return {
    ok: true,
    user: { tg_id: payload.id, username: payload.username, first_name: payload.first_name },
  };
}

export function verifyInitData(
  initData: string,
  botToken: string,
  nowMs: number = Date.now(),
): VerifyResult {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "malformed" };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!safeEqualHex(expected, hash)) return { ok: false, reason: "bad_hash" };
  if (!isFresh(Number(params.get("auth_date")), nowMs)) return { ok: false, reason: "expired" };

  try {
    const user = JSON.parse(params.get("user") ?? "") as {
      id?: number;
      username?: string;
      first_name?: string;
    };
    if (typeof user.id !== "number") return { ok: false, reason: "malformed" };
    return {
      ok: true,
      user: { tg_id: user.id, username: user.username, first_name: user.first_name },
    };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
