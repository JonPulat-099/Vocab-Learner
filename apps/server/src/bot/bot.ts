import { Bot, InlineKeyboard, type Context } from "grammy";
import type { WordSummary } from "@vocab/shared";
import type { WordsRepo, WordRow } from "../services/words.repo.js";
import type { UsersRepo } from "../db/users.repo.js";
import type { GeminiService } from "../services/gemini.service.js";
import { GeminiUnavailable } from "../services/gemini.service.js";
import { buildRawSummary } from "../services/raw-summary.js";
import { parseMw } from "../services/mw.service.js";
import { formatCard } from "./format.js";
import { texts } from "./texts.js";

const MAX_SUGGESTIONS = 6;

export interface BotDeps {
  token: string;
  ownerTgId: number;
  webOrigin: string;
  wordsRepo: WordsRepo;
  usersRepo: UsersRepo;
  gemini: GeminiService;
}

export function createBot(deps: BotDeps): Bot {
  const bot = new Bot(deps.token);

  // Single-user guard: silently drop updates from anyone but the owner.
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== deps.ownerTgId) return;
    await next();
  });

  bot.command("start", async (ctx) => {
    await deps.usersRepo.upsertUser(ctx.from!);
    await ctx.reply(texts.start);
  });

  bot.command("search", async (ctx) => {
    const word = ctx.match.trim();
    if (!word) {
      await ctx.reply(texts.emptySearch);
      return;
    }
    await runSearch(ctx, word);
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

  // Save / clear arrive in Phase 3 — acknowledge so buttons don't spin.
  bot.callbackQuery(/^(save:.*|clear)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: texts.comingSoon });
  });

  bot.catch((err) => {
    console.error("bot error:", err.error);
  });

  async function runSearch(ctx: Context, word: string): Promise<void> {
    const chatId = ctx.chatId!;
    const placeholder = await ctx.api.sendMessage(chatId, texts.searching);
    try {
      const lookup = await deps.wordsRepo.getOrFetchWord(word);

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

      const summary = await resolveSummary(lookup.row);
      const card = formatCard(summary);
      await ctx.api.editMessageText(chatId, placeholder.message_id, card.text, {
        parse_mode: "HTML",
        reply_markup: cardKeyboard(lookup.row, card.truncated),
      });

      if (ctx.from && ctx.message) {
        const user = await deps.usersRepo.upsertUser(ctx.from);
        await deps.usersRepo.insertSearchHistory({
          user_id: user.id,
          word_id: lookup.row.id,
          chat_id: chatId,
          query_message_id: ctx.message.message_id,
          result_message_id: placeholder.message_id,
        });
      }
    } catch (err) {
      console.error("search failed:", err);
      await ctx.api
        .editMessageText(chatId, placeholder.message_id, texts.searchError)
        .catch(() => {});
    }
  }

  async function resolveSummary(row: WordRow): Promise<WordSummary> {
    if (row.summary) return row.summary;
    const mw = parseMw(row.mw_data);
    try {
      const summary = await deps.gemini.summarizeWord({
        word: row.word,
        mw,
        cambridge: row.cambridge_data,
      });
      await deps.wordsRepo.saveSummary(row.id, summary);
      return summary;
    } catch (err) {
      if (err instanceof GeminiUnavailable) {
        console.error(err.message);
        // Not cached — next search retries Gemini.
        return buildRawSummary(row.word, mw, row.cambridge_data);
      }
      throw err;
    }
  }

  function cardKeyboard(row: WordRow, truncated: boolean): InlineKeyboard {
    const keyboard = new InlineKeyboard()
      .text(texts.buttons.save, `save:${row.id}`)
      .url(
        texts.buttons.youglish,
        row.youglish_data?.link ?? `https://youglish.com/pron/${encodeURIComponent(row.word)}/english`,
      )
      .text(texts.buttons.clearHistory, "clear");
    if (truncated) {
      keyboard.row().url(texts.buttons.fullEntry, `${deps.webOrigin}/word/${row.id}`);
    }
    return keyboard;
  }

  return bot;
}
