import { Bot, InlineKeyboard, type Context } from "grammy";
import type { InlineKeyboardMarkup } from "grammy/types";
import type { WordSummary } from "@vocab/shared";
import type { WordsRepo, WordRow } from "../services/words.repo.js";
import type { UsersRepo } from "../db/users.repo.js";
import type { UserWordsRepo } from "../db/user-words.repo.js";
import type { GeminiService } from "../services/gemini.service.js";
import { GeminiUnavailable } from "../services/gemini.service.js";
import { buildRawSummary } from "../services/raw-summary.js";
import { parseMw } from "../services/mw.service.js";
import { formatCard } from "./format.js";
import { texts } from "./texts.js";

const MAX_SUGGESTIONS = 6;
const HISTORY_LIMIT = 10;
const MYWORDS_PAGE_SIZE = 10;
// Chat cleanup: pause between batches of deleteMessage calls to respect rate limits.
const DELETE_BATCH_SIZE = 20;
const DELETE_BATCH_PAUSE_MS = 300;

/** Commands shown in Telegram's menu button (registered via setMyCommands). */
export const BOT_COMMANDS = [
  { command: "search", description: "Look a word up" },
  { command: "mywords", description: "Your saved words" },
  { command: "history", description: "Recent searches" },
  { command: "clear", description: "Clear search history" },
  { command: "help", description: "How to use the bot" },
  { command: "start", description: "Restart the bot" },
] as const;

/** Minimal logger surface (pino-compatible). */
export interface BotLogger {
  info(obj: Record<string, unknown> | string, msg?: string): void;
  warn(obj: Record<string, unknown> | string, msg?: string): void;
  error(obj: Record<string, unknown> | string, msg?: string): void;
}

const noopLogger: BotLogger = { info() {}, warn() {}, error() {} };

export interface BotDeps {
  token: string;
  /** Unset = no single-user guard; the bot answers any Telegram user. */
  ownerTgId?: number;
  webOrigin: string;
  wordsRepo: WordsRepo;
  usersRepo: UsersRepo;
  userWordsRepo: UserWordsRepo;
  gemini: GeminiService;
  logger?: BotLogger;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createBot(deps: BotDeps): Bot {
  const bot = new Bot(deps.token);
  const log = deps.logger ?? noopLogger;

  // Single-user guard (only when ownerTgId is configured): silently drop
  // updates from anyone but the owner.
  bot.use(async (ctx, next) => {
    if (deps.ownerTgId !== undefined && ctx.from?.id !== deps.ownerTgId) {
      log.warn({ tg_id: ctx.from?.id }, "ignored update from non-owner");
      return;
    }
    await next();
  });

  bot.command("start", async (ctx) => {
    await deps.usersRepo.upsertUser(ctx.from!);
    await ctx.reply(texts.start);
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(texts.help);
  });

  bot.command("search", async (ctx) => {
    const word = ctx.match.trim();
    if (!word) {
      await ctx.reply(texts.emptySearch);
      return;
    }
    await runSearch(ctx, word);
  });

  bot.command("mywords", async (ctx) => {
    await renderMyWords(ctx, 0, false);
  });

  bot.command("history", async (ctx) => {
    await renderHistory(ctx);
  });

  bot.command("clear", async (ctx) => {
    await sendClearConfirm(ctx);
  });

  bot.on("message:text", async (ctx) => {
    const word = ctx.message.text.trim();
    if (word.startsWith("/")) return;
    await runSearch(ctx, word);
  });

  bot.callbackQuery(/^search:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await runSearch(ctx, ctx.match[1]!);
  });

  bot.callbackQuery(/^save:(.+)$/, async (ctx) => {
    const wordId = ctx.match[1]!;
    const user = await deps.usersRepo.upsertUser(ctx.from);
    await deps.userWordsRepo.saveWord(user.id, wordId);
    log.info({ word_id: wordId }, "word saved");
    await ctx.answerCallbackQuery({ text: texts.savedToast });
    const markup = ctx.callbackQuery.message?.reply_markup;
    if (markup) {
      await ctx
        .editMessageReplyMarkup({ reply_markup: markSaved(markup, wordId) })
        .catch(() => {}); // markup unchanged (double tap) — nothing to do
    }
  });

  bot.callbackQuery(/^saved:.+$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: texts.alreadySaved });
  });

  bot.callbackQuery(/^open:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await openWord(ctx, ctx.match[1]!);
  });

  bot.callbackQuery(/^mywords:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderMyWords(ctx, Number(ctx.match[1]), true);
  });

  bot.callbackQuery("clear", async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendClearConfirm(ctx);
  });

  bot.callbackQuery("clear:cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(texts.clearCancelled);
  });

  bot.callbackQuery("clear:confirm", async (ctx) => {
    await ctx.answerCallbackQuery();
    await runClearHistory(ctx);
  });

  bot.callbackQuery("noop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  bot.catch((err) => {
    log.error({ err: err.error }, "bot error");
  });

  async function runSearch(ctx: Context, word: string): Promise<void> {
    const chatId = ctx.chatId!;
    log.info({ word }, "search started");
    const placeholder = await ctx.api.sendMessage(chatId, texts.searching);
    try {
      const user = await deps.usersRepo.upsertUser(ctx.from!);
      const lookup = await deps.wordsRepo.getOrFetchWord(word);
      log.info({ word, result: lookup.kind }, "lookup finished");

      if (lookup.kind === "suggestions") {
        const keyboard = new InlineKeyboard();
        lookup.suggestions.slice(0, MAX_SUGGESTIONS).forEach((s, i) => {
          keyboard.text(s, `search:${s}`);
          if (i % 2 === 1) keyboard.row();
        });
        await ctx.api.editMessageText(chatId, placeholder.message_id, texts.didYouMean(word), {
          reply_markup: keyboard,
        });
        return;
      }

      if (lookup.kind === "not_found") {
        await ctx.api.editMessageText(chatId, placeholder.message_id, texts.notFound(word));
        return;
      }

      await editInCard(ctx, chatId, placeholder.message_id, lookup.row, user.id);

      if (ctx.message) {
        await deps.usersRepo.insertSearchHistory({
          user_id: user.id,
          word_id: lookup.row.id,
          chat_id: chatId,
          query_message_id: ctx.message.message_id,
          result_message_id: placeholder.message_id,
        });
      }
    } catch (err) {
      log.error({ word, err }, "search failed");
      await ctx.api
        .editMessageText(chatId, placeholder.message_id, texts.searchError)
        .catch(() => {});
    }
  }

  /** Re-open a card from /mywords or /history — cache only, never re-fetches sources. */
  async function openWord(ctx: Context, wordId: string): Promise<void> {
    const chatId = ctx.chatId!;
    const placeholder = await ctx.api.sendMessage(chatId, texts.searching);
    try {
      const user = await deps.usersRepo.upsertUser(ctx.from!);
      const row = await deps.wordsRepo.getWordById(wordId);
      if (!row) {
        await ctx.api.editMessageText(chatId, placeholder.message_id, texts.wordGone);
        return;
      }
      await editInCard(ctx, chatId, placeholder.message_id, row, user.id);
    } catch (err) {
      log.error({ word_id: wordId, err }, "open word failed");
      await ctx.api
        .editMessageText(chatId, placeholder.message_id, texts.searchError)
        .catch(() => {});
    }
  }

  async function editInCard(
    ctx: Context,
    chatId: number,
    messageId: number,
    row: WordRow,
    userId: string,
  ): Promise<void> {
    const summary = await resolveSummary(row);
    const card = formatCard(summary);
    const saved = await deps.userWordsRepo.isSaved(userId, row.id);
    await ctx.api.editMessageText(chatId, messageId, card.text, {
      parse_mode: "HTML",
      reply_markup: cardKeyboard(row, card.truncated, saved),
    });
  }

  async function renderMyWords(ctx: Context, page: number, edit: boolean): Promise<void> {
    const user = await deps.usersRepo.upsertUser(ctx.from!);
    let { items, total } = await deps.userWordsRepo.listSaved(user.id, page, MYWORDS_PAGE_SIZE);
    if (total === 0) {
      if (edit) await ctx.editMessageText(texts.mywordsEmpty);
      else await ctx.reply(texts.mywordsEmpty);
      return;
    }
    const pages = Math.ceil(total / MYWORDS_PAGE_SIZE);
    if (items.length === 0 && page >= pages) {
      // Page fell off the end (words unsaved elsewhere) — clamp to the last page.
      page = pages - 1;
      ({ items, total } = await deps.userWordsRepo.listSaved(user.id, page, MYWORDS_PAGE_SIZE));
    }

    const keyboard = new InlineKeyboard();
    items.forEach((item, i) => {
      keyboard.text(item.word, `open:${item.word_id}`);
      if (i % 2 === 1) keyboard.row();
    });
    keyboard.row();
    if (pages > 1) {
      if (page > 0) keyboard.text(texts.buttons.prevPage, `mywords:${page - 1}`);
      keyboard.text(`${page + 1}/${pages}`, "noop");
      if (page < pages - 1) keyboard.text(texts.buttons.nextPage, `mywords:${page + 1}`);
    }

    const text = texts.mywordsHeader(total, page, pages);
    if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
    else await ctx.reply(text, { reply_markup: keyboard });
  }

  async function renderHistory(ctx: Context): Promise<void> {
    const user = await deps.usersRepo.upsertUser(ctx.from!);
    const recent = await deps.usersRepo.listRecentSearches(user.id, HISTORY_LIMIT);
    if (recent.length === 0) {
      await ctx.reply(texts.historyEmpty);
      return;
    }
    const keyboard = new InlineKeyboard();
    recent.forEach((item, i) => {
      keyboard.text(item.word, `open:${item.word_id}`);
      if (i % 2 === 1) keyboard.row();
    });
    keyboard.row().text(texts.buttons.clearHistory, "clear");
    await ctx.reply(texts.historyHeader, { reply_markup: keyboard });
  }

  async function sendClearConfirm(ctx: Context): Promise<void> {
    const keyboard = new InlineKeyboard()
      .text(texts.buttons.confirmClear, "clear:confirm")
      .text(texts.buttons.cancel, "clear:cancel");
    await ctx.reply(texts.clearConfirm, { reply_markup: keyboard });
  }

  /**
   * Chat cleanup: delete every stored query/result message, then wipe the rows.
   * Telegram rejects deletes for messages older than 48h — skip those and continue.
   */
  async function runClearHistory(ctx: Context): Promise<void> {
    await ctx.editMessageText(texts.clearing).catch(() => {});
    const user = await deps.usersRepo.upsertUser(ctx.from!);
    const rows = await deps.usersRepo.listSearchHistoryMessages(user.id);

    let deleted = 0;
    let skipped = 0;
    let attempts = 0;
    for (const row of rows) {
      if (row.chat_id === null) continue;
      for (const messageId of [row.query_message_id, row.result_message_id]) {
        if (messageId === null) continue;
        try {
          await ctx.api.deleteMessage(row.chat_id, messageId);
          deleted++;
        } catch {
          skipped++; // >48h old or already gone — never abort the loop
        }
        if (++attempts % DELETE_BATCH_SIZE === 0) await sleep(DELETE_BATCH_PAUSE_MS);
      }
    }

    await deps.usersRepo.clearSearchHistory(user.id);
    log.info({ deleted, skipped }, "search history cleared");
    await ctx.editMessageText(texts.clearDone(deleted, skipped)).catch(() => {});
  }

  async function resolveSummary(row: WordRow): Promise<WordSummary> {
    if (row.summary) {
      log.info({ word: row.word }, "summary served from cache");
      return row.summary;
    }
    try {
      const summary = await deps.gemini.summarizeWord({
        word: row.word,
        mwRaw: row.mw_data,
        cambridge: row.cambridge_data,
      });
      await deps.wordsRepo.saveSummary(row.id, summary);
      log.info({ word: row.word }, "gemini summary generated and cached");
      return summary;
    } catch (err) {
      if (err instanceof GeminiUnavailable) {
        log.warn({ word: row.word, err: err.message }, "gemini unavailable — raw fallback card");
        // Not cached — next search retries Gemini.
        return buildRawSummary(row.word, parseMw(row.mw_data), row.cambridge_data);
      }
      throw err;
    }
  }

  function cardKeyboard(row: WordRow, truncated: boolean, saved: boolean): InlineKeyboard {
    const keyboard = new InlineKeyboard();
    if (saved) keyboard.text(texts.buttons.saved, `saved:${row.id}`);
    else keyboard.text(texts.buttons.save, `save:${row.id}`);
    // Telegram accepts web_app buttons only for https URLs — on localhost the
    // 🎧 button stays a plain youglish.com link.
    if (deps.webOrigin.startsWith("https://")) {
      keyboard.webApp(texts.buttons.youglish, `${deps.webOrigin}/youglish/${encodeURIComponent(row.word)}`);
    } else {
      keyboard.url(
        texts.buttons.youglish,
        row.youglish_data?.link ?? `https://youglish.com/pron/${encodeURIComponent(row.word)}/english`,
      );
    }
    keyboard.text(texts.buttons.clearHistory, "clear");
    // Telegram rejects non-public URLs (localhost) in inline buttons — https only.
    if (truncated && deps.webOrigin.startsWith("https://")) {
      keyboard.row().url(texts.buttons.fullEntry, `${deps.webOrigin}/word/${row.id}`);
    }
    return keyboard;
  }

  return bot;
}

/** Swap the 💾 Save button for ✅ Saved, leaving the rest of the keyboard intact. */
function markSaved(markup: InlineKeyboardMarkup, wordId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: markup.inline_keyboard.map((row) =>
      row.map((button) =>
        "callback_data" in button && button.callback_data === `save:${wordId}`
          ? { text: texts.buttons.saved, callback_data: `saved:${wordId}` }
          : button,
      ),
    ),
  };
}
