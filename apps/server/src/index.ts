import Fastify from "fastify";
import { webhookCallback } from "grammy";
import { config } from "./config.js";
import { getSupabase } from "./db/supabase.js";
import { createUsersRepo } from "./db/users.repo.js";
import { createUserWordsRepo } from "./db/user-words.repo.js";
import { createPracticeRepo } from "./db/practice.repo.js";
import { createWordsRepo } from "./services/words.repo.js";
import { createGeminiService } from "./services/gemini.service.js";
import { createOpenAiCompatibleService } from "./services/openai-compatible.service.js";
import type { SummarizerService } from "./services/summarizer.js";
import { createActiveModelHolder } from "./services/active-model.js";
import { createBotSettingsRepo } from "./db/bot-settings.repo.js";
import { BOT_COMMANDS, createBot } from "./bot/bot.js";
import { registerApi } from "./routes/api.js";

const app = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    ...(config.NODE_ENV === "development"
      ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } } }
      : {}),
  },
});
const supabase = getSupabase();

const wordsRepo = createWordsRepo({
  supabase,
  mwApiKey: config.MW_API_KEY,
  cambridgeBaseUrl: config.CAMBRIDGE_BASE_URL,
  youglishApiKey: config.YOUGLISH_API_KEY,
  sourceTimeoutMs: config.SOURCE_TIMEOUT_MS,
  cacheTtlDays: config.WORD_CACHE_TTL_DAYS,
  logger: app.log,
});

// One entry per provider whose env vars are present; config.ts guarantees at
// least one. The owner switches between them at runtime via the hidden /model
// command; the choice is persisted in bot_settings.active_model.
const providers: Record<string, SummarizerService> = {};
if (config.GEMINI_API_KEY) {
  providers.gemini = createGeminiService({
    apiKey: config.GEMINI_API_KEY,
    model: config.GEMINI_MODEL,
    timeoutMs: config.GEMINI_TIMEOUT_MS,
  });
}
if (config.DEEPSEEK_API_KEY) {
  providers.deepseek = createOpenAiCompatibleService({
    providerLabel: "deepseek",
    baseURL: config.DEEPSEEK_BASE_URL,
    apiKey: config.DEEPSEEK_API_KEY,
    model: config.DEEPSEEK_MODEL,
    timeoutMs: config.DEEPSEEK_TIMEOUT_MS,
  });
}
if (config.GLM_API_KEY) {
  providers.glm = createOpenAiCompatibleService({
    providerLabel: "glm",
    baseURL: config.GLM_BASE_URL,
    apiKey: config.GLM_API_KEY,
    model: config.GLM_MODEL,
    timeoutMs: config.GLM_TIMEOUT_MS,
  });
}
if (config.SAKANA_API_KEY) {
  providers.sakana = createOpenAiCompatibleService({
    providerLabel: "sakana",
    baseURL: config.SAKANA_BASE_URL,
    apiKey: config.SAKANA_API_KEY,
    model: config.SAKANA_MODEL,
    timeoutMs: config.SAKANA_TIMEOUT_MS,
  });
}
if (config.KIMI_API_KEY) {
  providers.kimi = createOpenAiCompatibleService({
    providerLabel: "kimi",
    baseURL: config.KIMI_BASE_URL,
    apiKey: config.KIMI_API_KEY,
    model: config.KIMI_MODEL,
    timeoutMs: config.KIMI_TIMEOUT_MS,
  });
}
if (config.COPILOT_BASE_URL) {
  providers.copilot = createOpenAiCompatibleService({
    providerLabel: "copilot",
    baseURL: config.COPILOT_BASE_URL,
    apiKey: config.COPILOT_API_KEY,
    model: config.COPILOT_MODEL,
    timeoutMs: config.COPILOT_TIMEOUT_MS,
  });
}

const botSettingsRepo = createBotSettingsRepo(supabase);
let persistedActiveModel = await botSettingsRepo.getActiveModel();
if (!providers[persistedActiveModel]) {
  // The persisted choice's provider was un-configured since it was set (env
  // var removed) — fall back to any configured one and persist the correction.
  const fallback = Object.keys(providers)[0]!;
  app.log.warn(
    { persisted: persistedActiveModel, fallback },
    "persisted active_model has no configured provider — falling back",
  );
  persistedActiveModel = fallback;
  await botSettingsRepo
    .setActiveModel(fallback)
    .catch((err) => app.log.warn({ err }, "failed to persist corrected active_model"));
}
const activeModel = createActiveModelHolder(persistedActiveModel, botSettingsRepo);

const usersRepo = createUsersRepo(supabase);
const userWordsRepo = createUserWordsRepo(supabase);

const bot = createBot({
  token: config.BOT_TOKEN,
  ownerTgId: config.OWNER_TG_ID,
  webOrigin: config.WEB_ORIGIN,
  wordsRepo,
  usersRepo,
  userWordsRepo,
  providers,
  activeModel,
  logger: app.log,
});

await registerApi(app, {
  botToken: config.BOT_TOKEN,
  ownerTgId: config.OWNER_TG_ID,
  jwtSecret: config.JWT_SECRET,
  jwtExpiresIn: config.JWT_EXPIRES_IN,
  webOrigin: config.WEB_ORIGIN,
  allowDevLogin: config.NODE_ENV === "development",
  usersRepo,
  userWordsRepo,
  wordsRepo,
  practiceRepo: createPracticeRepo(supabase),
});

// Populates Telegram's menu button; non-fatal if Telegram is unreachable at boot.
bot.api.setMyCommands([...BOT_COMMANDS]).catch((err) => {
  app.log.warn({ err }, "failed to register bot commands menu");
});

// Chat menu button opens the dictionary as a Mini App (https-only, like all web_app URLs).
if (config.WEB_ORIGIN.startsWith("https://")) {
  bot.api
    .setChatMenuButton({
      menu_button: { type: "web_app", text: "Dictionary", web_app: { url: config.WEB_ORIGIN } },
    })
    .catch((err) => {
      app.log.warn({ err }, "failed to set chat menu button");
    });
}

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
