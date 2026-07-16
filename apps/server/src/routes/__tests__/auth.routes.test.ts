import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  buildTestApp,
  loginAsOwner,
  ownerRow,
  signedInitData,
  OWNER_TG_ID,
} from "./helpers.js";

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

describe("POST /api/auth/telegram", () => {
  it("issues a JWT for validly signed owner initData", async () => {
    app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/telegram",
      payload: { initData: signedInitData(OWNER_TG_ID) },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { token: string }).token).toBeTruthy();
  });

  it("rejects forged initData with 401", async () => {
    app = await buildTestApp();
    const forged = signedInitData(OWNER_TG_ID).replace(/hash=\w{8}/, "hash=00000000");
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/telegram",
      payload: { initData: forged },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a valid signature from a non-owner tg id with 403", async () => {
    app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/telegram",
      payload: { initData: signedInitData(999) },
    });
    expect(res.statusCode).toBe(403);
  });

  it("issues a JWT to any verified user when ownerTgId is unset", async () => {
    app = await buildTestApp({ ownerTgId: undefined });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/telegram",
      payload: { initData: signedInitData(999) },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { token: string }).token).toBeTruthy();
  });

  it("rejects garbage bodies with 400", async () => {
    app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/telegram",
      payload: { nonsense: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/me", () => {
  it("returns the owner profile with a valid JWT", async () => {
    app = await buildTestApp();
    const token = await loginAsOwner(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: ownerRow.id,
      tg_id: OWNER_TG_ID,
      tg_username: "jon",
      first_name: "Jon",
    });
  });

  it("rejects missing/invalid tokens with 401", async () => {
    app = await buildTestApp();
    const noToken = await app.inject({ method: "GET", url: "/api/me" });
    expect(noToken.statusCode).toBe(401);
    const badToken = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: "Bearer not-a-jwt" },
    });
    expect(badToken.statusCode).toBe(401);
  });
});

describe("POST /api/auth/dev", () => {
  it("is not registered unless allowDevLogin", async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: "POST", url: "/api/auth/dev" });
    expect(res.statusCode).toBe(404);
  });

  it("issues a JWT when allowDevLogin is on", async () => {
    app = await buildTestApp({ allowDevLogin: true });
    const res = await app.inject({ method: "POST", url: "/api/auth/dev" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { token: string }).token).toBeTruthy();
  });

  it("is not registered when ownerTgId is unset, even with allowDevLogin", async () => {
    app = await buildTestApp({ allowDevLogin: true, ownerTgId: undefined });
    const res = await app.inject({ method: "POST", url: "/api/auth/dev" });
    expect(res.statusCode).toBe(404);
  });
});
