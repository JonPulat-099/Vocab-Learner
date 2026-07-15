import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { WordSummary } from "@vocab/shared";
import type { WordRow } from "../../services/words.repo.js";
import {
  buildTestApp,
  fakePracticeRepo,
  fakeUserWordsRepo,
  fakeUsersRepo,
  fakeWordsRepo,
  loginAsOwner,
  ownerRow,
} from "./helpers.js";

const WORD_ID = "11111111-1111-4111-8111-111111111111";
const USER_WORD_ID = "22222222-2222-4222-8222-222222222222";

const summary: WordSummary = {
  word: "feeling",
  forms: ["feelings"],
  part_of_speech: "noun",
  transcription: "/ˈfiː.lɪŋ/",
  cefr_guess: "B1",
  senses: [
    {
      guideword: "EMOTION",
      definition_en: "emotion",
      translation_ru: "чувство",
      translation_uz: "his",
      examples: [{ en: "guilty feelings", ru: "чувство вины" }],
    },
  ],
  synonyms: ["emotion"],
  idioms: [],
  usage_note: "",
};

const wordRow: WordRow = {
  id: WORD_ID,
  word: "feeling",
  mw_data: [{ meta: { id: "feeling" } }],
  cambridge_data: null,
  youglish_data: { link: "https://youglish.com/pron/feeling/english" },
  summary,
  fetched_at: "2026-07-15T00:00:00Z",
};

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

async function authedInject(
  appInstance: FastifyInstance,
  opts: { method: "GET" | "POST" | "DELETE"; url: string; payload?: unknown },
) {
  const token = await loginAsOwner(appInstance);
  return appInstance.inject({ ...opts, headers: { authorization: `Bearer ${token}` } });
}

describe("GET /api/words", () => {
  it("requires auth", async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/words" });
    expect(res.statusCode).toBe(401);
  });

  it("returns saved words and forwards the q filter", async () => {
    const listSavedDetailed = vi.fn().mockResolvedValue([
      {
        id: WORD_ID,
        word: "feeling",
        part_of_speech: "noun",
        translation_ru: "чувство",
        cefr_guess: "B1",
        saved_at: "2026-07-15T00:00:00Z",
      },
    ]);
    app = await buildTestApp({ userWordsRepo: fakeUserWordsRepo({ listSavedDetailed }) });
    const res = await authedInject(app, { method: "GET", url: "/api/words?q=feel" });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
    expect(listSavedDetailed).toHaveBeenCalledWith(ownerRow.id, "feel");
  });
});

describe("GET /api/words/:id", () => {
  it("returns summary plus all three raw payloads", async () => {
    app = await buildTestApp({
      wordsRepo: fakeWordsRepo({ getWordById: async (id) => (id === WORD_ID ? wordRow : null) }),
    });
    const res = await authedInject(app, { method: "GET", url: `/api/words/${WORD_ID}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.word).toBe("feeling");
    expect(body.summary.senses).toHaveLength(1);
    expect(body.mw_data).toEqual(wordRow.mw_data);
    expect(body.youglish_data).toEqual(wordRow.youglish_data);
  });

  it("404s for unknown ids and 400s for non-uuid ids", async () => {
    app = await buildTestApp();
    const missing = await authedInject(app, { method: "GET", url: `/api/words/${WORD_ID}` });
    expect(missing.statusCode).toBe(404);
    const invalid = await authedInject(app, { method: "GET", url: "/api/words/not-a-uuid" });
    expect(invalid.statusCode).toBe(400);
  });
});

describe("DELETE /api/words/:id", () => {
  it("unsaves and 404s when not saved", async () => {
    const unsaveWord = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    app = await buildTestApp({ userWordsRepo: fakeUserWordsRepo({ unsaveWord }) });
    const ok = await authedInject(app, { method: "DELETE", url: `/api/words/${WORD_ID}` });
    expect(ok.statusCode).toBe(200);
    const gone = await authedInject(app, { method: "DELETE", url: `/api/words/${WORD_ID}` });
    expect(gone.statusCode).toBe(404);
    expect(unsaveWord).toHaveBeenCalledWith(ownerRow.id, WORD_ID);
  });
});

describe("history routes", () => {
  it("lists history and clears DB rows only", async () => {
    const clearSearchHistory = vi.fn().mockResolvedValue(undefined);
    const listHistoryItems = vi
      .fn()
      .mockResolvedValue([
        { id: 1, word_id: WORD_ID, word: "feeling", created_at: "2026-07-15T00:00:00Z" },
      ]);
    app = await buildTestApp({
      usersRepo: fakeUsersRepo({ listHistoryItems, clearSearchHistory }),
    });
    const list = await authedInject(app, { method: "GET", url: "/api/history" });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);

    const clear = await authedInject(app, { method: "DELETE", url: "/api/history" });
    expect(clear.statusCode).toBe(200);
    expect(clearSearchHistory).toHaveBeenCalledWith(ownerRow.id);
  });
});

describe("practice routes", () => {
  it("builds a queue with defaults and picked word ids", async () => {
    const getQueue = vi.fn().mockResolvedValue([
      { user_word_id: USER_WORD_ID, word_id: WORD_ID, word: "feeling", summary },
    ]);
    app = await buildTestApp({ practiceRepo: fakePracticeRepo({ getQueue }) });

    const defaults = await authedInject(app, { method: "POST", url: "/api/practice/queue" });
    expect(defaults.statusCode).toBe(200);
    expect(defaults.json().cards).toHaveLength(1);
    expect(getQueue).toHaveBeenLastCalledWith(ownerRow.id, undefined, 20);

    const picked = await authedInject(app, {
      method: "POST",
      url: "/api/practice/queue",
      payload: { word_ids: [WORD_ID], limit: 5 },
    });
    expect(picked.statusCode).toBe(200);
    expect(getQueue).toHaveBeenLastCalledWith(ownerRow.id, [WORD_ID], 5);
  });

  it("records reviews, 404s on foreign cards, 400s on bad grades", async () => {
    const recordReview = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    app = await buildTestApp({ practiceRepo: fakePracticeRepo({ recordReview }) });

    const review = { user_word_id: USER_WORD_ID, grade: 1, mode: "flashcard" };
    const ok = await authedInject(app, {
      method: "POST",
      url: "/api/practice/review",
      payload: review,
    });
    expect(ok.statusCode).toBe(200);
    expect(recordReview).toHaveBeenCalledWith(ownerRow.id, review);

    const foreign = await authedInject(app, {
      method: "POST",
      url: "/api/practice/review",
      payload: review,
    });
    expect(foreign.statusCode).toBe(404);

    const badGrade = await authedInject(app, {
      method: "POST",
      url: "/api/practice/review",
      payload: { ...review, grade: 3 },
    });
    expect(badGrade.statusCode).toBe(400);
  });
});
