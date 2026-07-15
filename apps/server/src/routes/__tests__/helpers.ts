/** Shared test scaffolding for /api/* route tests — no real DB, no network. */
import Fastify, { type FastifyInstance } from "fastify";
import { createHmac } from "node:crypto";
import type { UsersRepo, UserRow } from "../../db/users.repo.js";
import type { UserWordsRepo } from "../../db/user-words.repo.js";
import type { PracticeRepo } from "../../db/practice.repo.js";
import type { WordsRepo } from "../../services/words.repo.js";
import { registerApi, type ApiDeps } from "../api.js";

export const BOT_TOKEN = "12345:TEST-TOKEN";
export const OWNER_TG_ID = 42;

export const ownerRow: UserRow = {
  id: "00000000-0000-4000-8000-000000000001",
  tg_id: OWNER_TG_ID,
  tg_username: "jon",
  first_name: "Jon",
};

export function fakeUsersRepo(overrides: Partial<UsersRepo> = {}): UsersRepo {
  return {
    upsertUser: async () => ownerRow,
    getById: async (id) => (id === ownerRow.id ? ownerRow : null),
    listHistoryItems: async () => [],
    insertSearchHistory: async () => {},
    listRecentSearches: async () => [],
    listSearchHistoryMessages: async () => [],
    clearSearchHistory: async () => {},
    ...overrides,
  };
}

export function fakeUserWordsRepo(overrides: Partial<UserWordsRepo> = {}): UserWordsRepo {
  return {
    saveWord: async () => {},
    isSaved: async () => false,
    listSaved: async () => ({ items: [], total: 0 }),
    listSavedDetailed: async () => [],
    unsaveWord: async () => false,
    ...overrides,
  };
}

export function fakeWordsRepo(overrides: Partial<WordsRepo> = {}): WordsRepo {
  return {
    getOrFetchWord: async () => ({ kind: "not_found" }),
    getWordById: async () => null,
    saveSummary: async () => {},
    ...overrides,
  };
}

export function fakePracticeRepo(overrides: Partial<PracticeRepo> = {}): PracticeRepo {
  return {
    getQueue: async () => [],
    recordReview: async () => false,
    ...overrides,
  };
}

export async function buildTestApp(deps: Partial<ApiDeps> = {}): Promise<FastifyInstance> {
  const app = Fastify();
  await registerApi(app, {
    botToken: BOT_TOKEN,
    ownerTgId: OWNER_TG_ID,
    jwtSecret: "test-jwt-secret",
    jwtExpiresIn: "1h",
    webOrigin: "http://localhost:5173",
    allowDevLogin: false,
    usersRepo: fakeUsersRepo(),
    userWordsRepo: fakeUserWordsRepo(),
    wordsRepo: fakeWordsRepo(),
    practiceRepo: fakePracticeRepo(),
    ...deps,
  });
  await app.ready();
  return app;
}

/** Builds a validly signed Mini App initData string for the given tg user id. */
export function signedInitData(tgId: number, authDate = Math.floor(Date.now() / 1000)): string {
  const fields: Record<string, string> = {
    auth_date: String(authDate),
    query_id: "AAF-test",
    user: JSON.stringify({ id: tgId, first_name: "Jon", username: "jon" }),
  };
  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

/** Logs in through the real auth route and returns a usable JWT. */
export async function loginAsOwner(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/telegram",
    payload: { initData: signedInitData(OWNER_TG_ID) },
  });
  if (res.statusCode !== 200) throw new Error(`test login failed: ${res.body}`);
  return (res.json() as { token: string }).token;
}
