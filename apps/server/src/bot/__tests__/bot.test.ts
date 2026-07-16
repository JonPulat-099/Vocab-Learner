import { describe, expect, it, vi } from "vitest";
import type { Update, UserFromGetMe } from "grammy/types";
import type { WordSummary } from "@vocab/shared";
import { createBot, type BotDeps } from "../bot.js";
import type { WordLookup, WordRow } from "../../services/words.repo.js";

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
    {
      guideword: "EMOTION",
      definition_en: "emotion",
      translation_ru: "чувство",
      translation_uz: "his",
      examples: [],
    },
  ],
  synonyms: [],
  idioms: [],
  usage_note: "",
};

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

function setup(
  lookups: Record<string, WordLookup>,
  webOrigin = "http://localhost:5173",
  opts: { failDeleteIds?: number[]; openMode?: boolean } = {},
) {
  const deps = {
    token: "test:token",
    ownerTgId: opts.openMode ? undefined : OWNER,
    webOrigin,
    wordsRepo: {
      getOrFetchWord: vi.fn(async (w: string) => lookups[w] ?? { kind: "not_found" as const }),
      getWordById: vi.fn(async () => null),
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
      listRecentSearches: vi.fn(async () => [] as Array<{ word_id: string; word: string }>),
      listSearchHistoryMessages: vi.fn(
        async () =>
          [] as Array<{
            chat_id: number | null;
            query_message_id: number | null;
            result_message_id: number | null;
          }>,
      ),
      clearSearchHistory: vi.fn(async () => {}),
    },
    userWordsRepo: {
      saveWord: vi.fn(async () => {}),
      isSaved: vi.fn(async () => false),
      listSaved: vi.fn(async () => ({ items: [] as Array<{ word_id: string; word: string }>, total: 0 })),
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
    if (
      method === "deleteMessage" &&
      opts.failDeleteIds?.includes((payload as { message_id: number }).message_id)
    ) {
      return { ok: false, error_code: 400, description: "message can't be deleted" } as never;
    }
    return { ok: true, result: true } as never;
  });

  return { bot, deps, calls };
}

function callbackUpdate(data: string, replyMarkup?: unknown): Update {
  return {
    update_id: 3,
    callback_query: {
      id: "cb1",
      from: { id: OWNER, is_bot: false, first_name: "T" },
      chat_instance: "ci",
      data,
      message: {
        message_id: 55,
        date: 0,
        chat: { id: 1, type: "private" },
        text: "card",
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      },
    },
  } as Update;
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

  it("answers any tg id when ownerTgId is unset", async () => {
    const { bot, calls } = setup({}, "http://localhost:5173", { openMode: true });
    await bot.handleUpdate(textUpdate("/start", 999));
    expect(calls.map((c) => c.method)).toContain("sendMessage");
  });

  it("/start upserts the user and replies", async () => {
    const { bot, deps, calls } = setup({});
    await bot.handleUpdate(textUpdate("/start"));
    expect(deps.usersRepo.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: OWNER }),
    );
    expect(calls.map((c) => c.method)).toContain("sendMessage");
  });

  it("/help replies with the help text without triggering a search", async () => {
    const { bot, deps, calls } = setup({});
    await bot.handleUpdate(textUpdate("/help"));
    const send = calls.find((c) => c.method === "sendMessage")!;
    expect(send.payload.text).toContain("/search");
    expect(deps.wordsRepo.getOrFetchWord).not.toHaveBeenCalled();
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

  it("omits the site button for non-https WEB_ORIGIN on truncated cards (Telegram rejects localhost URLs)", async () => {
    const manySenses = {
      ...feelingSummary,
      senses: Array.from({ length: 7 }, (_, i) => ({
        guideword: `G${i}`,
        definition_en: `def ${i}`,
        translation_ru: "",
        translation_uz: "",
        examples: [],
      })),
    };
    const keyboardFor = async (origin: string) => {
      const s = setup({ feeling: { kind: "word", row: feelingRow } }, origin);
      s.deps.gemini.summarizeWord.mockResolvedValue(manySenses);
      await s.bot.handleUpdate(textUpdate("feeling"));
      const edit = s.calls.find((c) => c.method === "editMessageText")!;
      return JSON.stringify(edit.payload.reply_markup);
    };
    expect(await keyboardFor("http://localhost:5173")).not.toContain("Full entry");
    expect(await keyboardFor("https://vocab.pages.dev")).toContain("Full entry");
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
    const { GeminiUnavailable } = await import("../../services/gemini.service.js");
    deps.gemini.summarizeWord.mockRejectedValue(new GeminiUnavailable("down"));

    await bot.handleUpdate(textUpdate("feeling"));
    const edit = calls.find((c) => c.method === "editMessageText")!;
    expect(edit.payload.text).toContain("(EMOTION) emotion");
    expect(edit.payload.text).toContain("<i>чувство</i>");
    expect(deps.wordsRepo.saveSummary).not.toHaveBeenCalled();
  });
});

describe("save button (3.1)", () => {
  const cardMarkup = {
    inline_keyboard: [
      [
        { text: "💾 Save", callback_data: "save:word-1" },
        { text: "🎧 YouGlish", url: "https://youglish.com/pron/feeling/english" },
        { text: "🗑 Clear history", callback_data: "clear" },
      ],
    ],
  };

  it("save:{word_id} upserts user_words and flips the button to ✅ Saved", async () => {
    const { bot, deps, calls } = setup({});
    await bot.handleUpdate(callbackUpdate("save:word-1", cardMarkup));

    expect(deps.userWordsRepo.saveWord).toHaveBeenCalledWith("user-1", "word-1");
    const toast = calls.find((c) => c.method === "answerCallbackQuery")!;
    expect(toast.payload.text).toContain("Saved");

    const edit = calls.find((c) => c.method === "editMessageReplyMarkup")!;
    const keyboard = (edit.payload.reply_markup as typeof cardMarkup).inline_keyboard.flat();
    expect(keyboard[0]).toEqual({ text: "✅ Saved", callback_data: "saved:word-1" });
    expect(keyboard[1]).toEqual(cardMarkup.inline_keyboard[0]![1]); // rest untouched
  });

  it("saved:{word_id} only acknowledges (idempotent re-tap)", async () => {
    const { bot, deps, calls } = setup({});
    await bot.handleUpdate(callbackUpdate("saved:word-1"));
    expect(deps.userWordsRepo.saveWord).not.toHaveBeenCalled();
    expect(calls.find((c) => c.method === "answerCallbackQuery")!.payload.text).toContain(
      "Already saved",
    );
  });

  it("search renders ✅ Saved for an already-saved word", async () => {
    const { bot, deps, calls } = setup({ feeling: { kind: "word", row: feelingRow } });
    deps.userWordsRepo.isSaved.mockResolvedValue(true);
    await bot.handleUpdate(textUpdate("feeling"));
    const edit = calls.find((c) => c.method === "editMessageText")!;
    expect(JSON.stringify(edit.payload.reply_markup)).toContain("saved:word-1");
  });
});

describe("/mywords (3.2)", () => {
  it("shows an empty-state message when nothing is saved", async () => {
    const { bot, calls } = setup({});
    await bot.handleUpdate(textUpdate("/mywords"));
    const send = calls.find((c) => c.method === "sendMessage")!;
    expect(send.payload.text).toContain("haven't saved");
  });

  it("lists 10 words per page with pagination controls", async () => {
    const { bot, deps, calls } = setup({});
    deps.userWordsRepo.listSaved.mockResolvedValue({
      items: Array.from({ length: 10 }, (_, i) => ({ word_id: `w${i}`, word: `word${i}` })),
      total: 25,
    });
    await bot.handleUpdate(textUpdate("/mywords"));

    const send = calls.find((c) => c.method === "sendMessage")!;
    const buttons = (
      send.payload.reply_markup as { inline_keyboard: Array<Array<{ text: string; callback_data?: string }>> }
    ).inline_keyboard.flat();
    expect(buttons.filter((b) => b.callback_data?.startsWith("open:"))).toHaveLength(10);
    expect(buttons.some((b) => b.text === "1/3")).toBe(true);
    expect(buttons.some((b) => b.callback_data === "mywords:1")).toBe(true); // next
    expect(buttons.some((b) => b.callback_data === "mywords:-1")).toBe(false); // no prev on page 0
  });

  it("mywords:{page} callback edits the list in place", async () => {
    const { bot, deps, calls } = setup({});
    deps.userWordsRepo.listSaved.mockResolvedValue({
      items: [{ word_id: "w10", word: "word10" }],
      total: 25,
    });
    await bot.handleUpdate(callbackUpdate("mywords:1"));
    expect(deps.userWordsRepo.listSaved).toHaveBeenCalledWith("user-1", 1, 10);
    const edit = calls.find((c) => c.method === "editMessageText")!;
    const markup = JSON.stringify(edit.payload.reply_markup);
    expect(markup).toContain("mywords:0"); // prev
    expect(markup).toContain("mywords:2"); // next
  });

  it("tapping a word re-renders the card from cache", async () => {
    const { bot, deps, calls } = setup({});
    deps.wordsRepo.getWordById.mockResolvedValue({ ...feelingRow, summary: feelingSummary } as never);
    await bot.handleUpdate(callbackUpdate("open:word-1"));

    expect(deps.wordsRepo.getWordById).toHaveBeenCalledWith("word-1");
    expect(deps.wordsRepo.getOrFetchWord).not.toHaveBeenCalled();
    expect(deps.gemini.summarizeWord).not.toHaveBeenCalled(); // summary already cached
    const edit = calls.find((c) => c.method === "editMessageText")!;
    expect(edit.payload.text).toContain("<b>feeling</b>");
  });

  it("open:{id} for an evicted word shows a friendly message", async () => {
    const { bot, calls } = setup({});
    await bot.handleUpdate(callbackUpdate("open:gone"));
    const edit = calls.find((c) => c.method === "editMessageText")!;
    expect(edit.payload.text).toContain("no longer in the cache");
  });
});

describe("/history (3.3)", () => {
  it("shows an empty-state message with no searches", async () => {
    const { bot, calls } = setup({});
    await bot.handleUpdate(textUpdate("/history"));
    expect(calls.find((c) => c.method === "sendMessage")!.payload.text).toContain("No searches");
  });

  it("lists recent searches as open buttons plus a clear button", async () => {
    const { bot, deps, calls } = setup({});
    deps.usersRepo.listRecentSearches.mockResolvedValue([
      { word_id: "w1", word: "feeling" },
      { word_id: "w2", word: "cat" },
    ]);
    await bot.handleUpdate(textUpdate("/history"));

    const send = calls.find((c) => c.method === "sendMessage")!;
    const buttons = (
      send.payload.reply_markup as { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> }
    ).inline_keyboard.flat();
    expect(buttons).toContainEqual({ text: "feeling", callback_data: "open:w1" });
    expect(buttons).toContainEqual({ text: "cat", callback_data: "open:w2" });
    expect(buttons.at(-1)!.callback_data).toBe("clear");
  });
});

describe("clear history (3.4)", () => {
  it("/clear and the 🗑 button ask for confirmation mentioning the 48h limit", async () => {
    const { bot, calls } = setup({});
    await bot.handleUpdate(textUpdate("/clear"));
    await bot.handleUpdate(callbackUpdate("clear"));

    const confirms = calls.filter((c) => c.method === "sendMessage");
    expect(confirms).toHaveLength(2);
    for (const confirm of confirms) {
      expect(confirm.payload.text).toContain("48 hours");
      const markup = JSON.stringify(confirm.payload.reply_markup);
      expect(markup).toContain("clear:confirm");
      expect(markup).toContain("clear:cancel");
    }
  });

  it("clear:cancel keeps history", async () => {
    const { bot, deps, calls } = setup({});
    await bot.handleUpdate(callbackUpdate("clear:cancel"));
    expect(deps.usersRepo.clearSearchHistory).not.toHaveBeenCalled();
    const edit = calls.find((c) => c.method === "editMessageText")!;
    expect(edit.payload.text).toContain("kept");
  });

  it("clear:confirm deletes chat messages, skips >48h failures, then wipes rows", async () => {
    const { bot, deps, calls } = setup({}, "http://localhost:5173", { failDeleteIds: [101] });
    deps.usersRepo.listSearchHistoryMessages.mockResolvedValue([
      { chat_id: 1, query_message_id: 101, result_message_id: 102 }, // 101 too old → fails
      { chat_id: 1, query_message_id: 103, result_message_id: 104 },
    ]);
    await bot.handleUpdate(callbackUpdate("clear:confirm"));

    const deletes = calls.filter((c) => c.method === "deleteMessage");
    expect(deletes.map((c) => c.payload.message_id)).toEqual([101, 102, 103, 104]);
    expect(deps.usersRepo.clearSearchHistory).toHaveBeenCalledWith("user-1");

    const finalEdit = calls.filter((c) => c.method === "editMessageText").at(-1)!;
    expect(finalEdit.payload.text).toContain("Deleted 3");
    expect(finalEdit.payload.text).toContain("1 were too old");
  });
});

describe("🎧 button web_app branch (5.6)", () => {
  const lookups = { feeling: { kind: "word" as const, row: feelingRow } };

  function youglishButton(calls: ApiCall[]) {
    const edit = calls.find((c) => c.method === "editMessageText")!;
    const keyboard = (
      edit.payload.reply_markup as {
        inline_keyboard: Array<Array<{ text: string; url?: string; web_app?: { url: string } }>>;
      }
    ).inline_keyboard.flat();
    return keyboard.find((b) => b.text.includes("YouGlish"))!;
  }

  it("uses a web_app button when WEB_ORIGIN is https", async () => {
    const { bot, calls } = setup(lookups, "https://vocab.example.app");
    await bot.handleUpdate(textUpdate("feeling"));
    const button = youglishButton(calls);
    expect(button.web_app).toEqual({ url: "https://vocab.example.app/youglish/feeling" });
    expect(button.url).toBeUndefined();
  });

  it("keeps the plain youglish.com URL on non-https origins (dev)", async () => {
    const { bot, calls } = setup(lookups, "http://localhost:5173");
    await bot.handleUpdate(textUpdate("feeling"));
    const button = youglishButton(calls);
    expect(button.url).toBe("https://youglish.com/pron/feeling/english");
    expect(button.web_app).toBeUndefined();
  });
});
