import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import type { TelegramLoginPayload } from "@vocab/shared";
import { AUTH_MAX_AGE_S, verifyInitData, verifyLoginWidget } from "../verify-telegram.js";

const BOT_TOKEN = "12345:TEST-TOKEN";
const NOW_MS = 1_750_000_000_000;
const AUTH_DATE = Math.floor(NOW_MS / 1000) - 60;

function signWidgetPayload(fields: Record<string, string | number>): TelegramLoginPayload {
  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHash("sha256").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return { ...fields, hash } as unknown as TelegramLoginPayload;
}

function signInitData(fields: Record<string, string>): string {
  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

describe("verifyLoginWidget", () => {
  const validFields = { id: 42, first_name: "Jon", username: "jon", auth_date: AUTH_DATE };

  it("accepts a correctly signed payload", () => {
    const result = verifyLoginWidget(signWidgetPayload(validFields), BOT_TOKEN, NOW_MS);
    expect(result).toEqual({
      ok: true,
      user: { tg_id: 42, username: "jon", first_name: "Jon" },
    });
  });

  it("rejects a tampered payload", () => {
    const payload = signWidgetPayload(validFields);
    const forged = { ...payload, id: 999 };
    expect(verifyLoginWidget(forged, BOT_TOKEN, NOW_MS)).toEqual({
      ok: false,
      reason: "bad_hash",
    });
  });

  it("rejects a stale auth_date", () => {
    const stale = signWidgetPayload({
      ...validFields,
      auth_date: Math.floor(NOW_MS / 1000) - AUTH_MAX_AGE_S - 10,
    });
    expect(verifyLoginWidget(stale, BOT_TOKEN, NOW_MS)).toEqual({ ok: false, reason: "expired" });
  });

  it("ignores optional fields left undefined", () => {
    const result = verifyLoginWidget(
      signWidgetPayload({ id: 42, auth_date: AUTH_DATE }),
      BOT_TOKEN,
      NOW_MS,
    );
    expect(result.ok).toBe(true);
  });
});

describe("verifyInitData", () => {
  const user = JSON.stringify({ id: 42, first_name: "Jon", username: "jon" });
  const validFields = { auth_date: String(AUTH_DATE), query_id: "AAF", user };

  it("accepts correctly signed initData", () => {
    const result = verifyInitData(signInitData(validFields), BOT_TOKEN, NOW_MS);
    expect(result).toEqual({
      ok: true,
      user: { tg_id: 42, username: "jon", first_name: "Jon" },
    });
  });

  it("rejects initData signed with a different bot token", () => {
    const result = verifyInitData(signInitData(validFields), "999:OTHER-TOKEN", NOW_MS);
    expect(result).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("rejects initData with a tampered user field", () => {
    const initData = signInitData(validFields);
    const params = new URLSearchParams(initData);
    params.set("user", JSON.stringify({ id: 999 }));
    expect(verifyInitData(params.toString(), BOT_TOKEN, NOW_MS)).toEqual({
      ok: false,
      reason: "bad_hash",
    });
  });

  it("rejects stale initData", () => {
    const stale = signInitData({
      ...validFields,
      auth_date: String(Math.floor(NOW_MS / 1000) - AUTH_MAX_AGE_S - 10),
    });
    expect(verifyInitData(stale, BOT_TOKEN, NOW_MS)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects initData without a hash", () => {
    expect(verifyInitData("auth_date=1&user=%7B%7D", BOT_TOKEN, NOW_MS)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});
