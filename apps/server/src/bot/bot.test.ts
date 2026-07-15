import { describe, expect, it, vi } from "vitest";
import type { Update, UserFromGetMe } from "grammy/types";
import type { WordSummary } from "@vocab/shared";
import { createBot, type BotDeps } from "./bot.js";
import type { WordLookup, WordRow } from "../services/words.repo.js";

const OWNER = 111;

const feelingRow: WordRow = {
  id: "word-1",
  word: "feeling",
  mw_data: [],
  cambridge_data: null,
  youglish_data: { link: "https://youglish.com/pron/feeling/english" },
  summary: null,
  fetched_at: new Date().toISOString(),
};

const feelingSummary: WordSummary = {
  word: "feeling",
  forms: [],
  part_of_speech: "noun",
  transcription: "",
  cefr_guess: "B1",
  senses: [
    { guideword: "EMOTION", definition_en: "emotion", translation_ru: "чувство", examples: [] },
  ],
  usage_note: "",
};

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

function setup(lookups: Record<string, WordLookup>) {
  const deps = {
    token: "test:token",
    ownerTgId: OWNER,
    webOrigin: "http://localhost:5173",
    wordsRepo: {
      getOrFetchWord: vi.fn(async (w: string) => lookups[w] ?? { kind: "not_found" as const }),
      saveSummary: vi.fn(async () => {}),
    },
    usersRepo: {
      upsertUser: vi.fn(async () => ({
        id: "user-1",
        tg_id: OWNER,
        tg_username: null,
        first_name: null,
      })),
      insertSearchHistory: vi.fn(async () => {}),
    },
    gemini: { summarizeWord: vi.fn(async () => feelingSummary) },
  };
  const bot = createBot(deps as unknown as BotDeps);
  bot.botInfo = {
    id: 42,
    is_bot: true,
    first_name: "vocab",
    username: "vocab_test_bot",
  } as UserFromGetMe;

  const calls: ApiCall[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    if (method === "sendMessage") {
      return { ok: true, result: { message_id: 900, chat: { id: 1 }, date: 0, text: "x" } } as never;
    }
    return { ok: true, result: true } as never;
  });

  return { bot, deps, calls };
}

function textUpdate(text: string, fromId = OWNER): Update {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      date: 0,
      chat: { id: 1, type: "private" },
      from: { id: fromId, is_bot: false, first_name: "T" },
      text,
      ...(text.startsWith("/")
        ? { entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }] }
        : {}),
    },
  } as Update;
}

describe("bot", () => {
  it("ignores updates from non-owner tg ids", async () => {
    const { bot, calls } = setup({});
    await bot.handleUpdate(textUpdate("/start", 999));
    expect(calls).toHaveLength(0);
  });

  it("/start upserts the user and replies", async () => {
    const { bot, deps, calls } = setup({});
    await bot.handleUpdate(textUpdate("/start"));
    expect(deps.usersRepo.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: OWNER }),
    );
    expect(calls.map((c) => c.method)).toContain("sendMessage");
  });

  it("search: sends placeholder, edits it with the HTML card, stores history", async () => {
    const { bot, deps, calls } = setup({ feeling: { kind: "word", row: feelingRow } });
    await bot.handleUpdate(textUpdate("feeling"));

    const send = calls.find((c) => c.method === "sendMessage")!;
    expect(send.payload.text).toContain("⏳");

    const edit = calls.find((c) => c.method === "editMessageText")!;
    expect(edit.payload.message_id).toBe(900);
    expect(edit.payload.parse_mode).toBe("HTML");
    expect(edit.payload.text).toContain("<b>feeling</b>");

    expect(deps.wordsRepo.saveSummary).toHaveBeenCalledWith("word-1", feelingSummary);
    expect(deps.usersRepo.insertSearchHistory).toHaveBeenCalledWith({
      user_id: "user-1",
      word_id: "word-1",
      chat_id: 1,
      query_message_id: 10,
      result_message_id: 900,
    });
  });

  it("did you mean: renders suggestion buttons (max 6) that re-trigger search", async () => {
    const { bot, calls } = setup({
      feelling: {
        kind: "suggestions",
        suggestions: ["feeling", "felling", "fueling", "filling", "falling", "fooling", "extra"],
      },
    });
    await bot.handleUpdate(textUpdate("feelling"));

    const edit = calls.find((c) => c.method === "editMessageText")!;
    const keyboard = (edit.payload.reply_markup as { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> })
      .inline_keyboard;
    const buttons = keyboard.flat();
    expect(buttons).toHaveLength(6);
    expect(buttons[0]).toEqual({ text: "feeling", callback_data: "search:feeling" });
  });

  it("callback search:feeling re-runs the search flow", async () => {
    const { bot, calls } = setup({ feeling: { kind: "word", row: feelingRow } });
    await bot.handleUpdate({
      update_id: 2,
      callback_query: {
        id: "cb1",
        from: { id: OWNER, is_bot: false, first_name: "T" },
        chat_instance: "ci",
        data: "search:feeling",
        message: {
          message_id: 55,
          date: 0,
          chat: { id: 1, type: "private" },
          text: "🤔",
        },
      },
    } as Update);

    const edit = calls.find((c) => c.method === "editMessageText")!;
    expect(edit.payload.text).toContain("<b>feeling</b>");
  });

  it("falls back to the raw card when Gemini is unavailable", async () => {
    const { bot, deps, calls } = setup({
      feeling: {
        kind: "word",
        row: {
          ...feelingRow,
          cambridge_data: {
            kind: "found",
            entries: [
              {
                headword: "feeling",
                pos: "noun",
                ipa: "ˈfiːlɪŋ",
                senses: [
                  {
                    guideword: "EMOTION",
                    definition_en: "emotion",
                    translation_ru: "чувство",
                    examples: [{ en: "guilty feelings", ru: null }],
                  },
                ],
              },
            ],
          },
        },
      },
    });
    const { GeminiUnavailable } = await import("../services/gemini.service.js");
    deps.gemini.summarizeWord.mockRejectedValue(new GeminiUnavailable("down"));

    await bot.handleUpdate(textUpdate("feeling"));
    const edit = calls.find((c) => c.method === "editMessageText")!;
    expect(edit.payload.text).toContain("emotion — чувство");
    expect(deps.wordsRepo.saveSummary).not.toHaveBeenCalled();
  });
});
