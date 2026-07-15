import Fastify from "fastify";
import { webhookCallback } from "grammy";
import { config } from "./config.js";
import { getSupabase } from "./db/supabase.js";
import { createUsersRepo } from "./db/users.repo.js";
import { createWordsRepo } from "./services/words.repo.js";
import { createGeminiService } from "./services/gemini.service.js";
import { createBot } from "./bot/bot.js";

const app = Fastify({ logger: { level: config.LOG_LEVEL } });
const supabase = getSupabase();

const wordsRepo = createWordsRepo({
  supabase,
  mwApiKey: config.MW_API_KEY,
  cambridgeBaseUrl: config.CAMBRIDGE_BASE_URL,
  youglishApiKey: config.YOUGLISH_API_KEY,
  sourceTimeoutMs: config.SOURCE_TIMEOUT_MS,
  cacheTtlDays: config.WORD_CACHE_TTL_DAYS,
});

const gemini = createGeminiService({
  apiKey: config.GEMINI_API_KEY,
  model: config.GEMINI_MODEL,
  timeoutMs: config.GEMINI_TIMEOUT_MS,
});

const bot = createBot({
  token: config.BOT_TOKEN,
  ownerTgId: config.OWNER_TG_ID,
  webOrigin: config.WEB_ORIGIN,
  wordsRepo,
  usersRepo: createUsersRepo(supabase),
  gemini,
});

app.get("/healthz", async () => ({ ok: true }));

if (config.BOT_MODE === "webhook") {
  app.post(
    `/webhook/${config.WEBHOOK_SECRET}`,
    webhookCallback(bot, "fastify", { secretToken: config.WEBHOOK_SECRET }),
  );
}

try {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

if (config.BOT_MODE === "polling") {
  // Long polling in dev — runs alongside Fastify in the same process.
  bot.start().catch((err) => {
    app.log.error({ err }, "bot polling crashed");
    process.exit(1);
  });
  app.log.info("bot started in long-polling mode");
}

const shutdown = async (): Promise<void> => {
  if (config.BOT_MODE === "polling") await bot.stop();
  await app.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
