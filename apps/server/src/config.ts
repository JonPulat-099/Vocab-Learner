import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  BOT_TOKEN: z.string().min(1),
  BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
  WEBHOOK_URL: z.string().url().optional(),
  WEBHOOK_SECRET: z.string().min(1).default("dev-webhook-secret"),
  // Unset = single-user guard off: bot and web auth accept any Telegram user.
  OWNER_TG_ID: z.coerce.number().int().optional(),

  MW_API_KEY: z.string().min(1),
  CAMBRIDGE_BASE_URL: z
    .string()
    .url()
    .default("https://dictionary.cambridge.org/dictionary/english-russian"),
  SOURCE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  YOUGLISH_API_KEY: z.string().optional(),

  // AI summarization providers — all optional, but at least one must be
  // configured (checked after parsing). The active one is picked at runtime
  // by the owner via the hidden /model command (bot_settings.active_model).
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().default("deepseek-v4-flash"),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  GLM_API_KEY: z.string().optional(),
  GLM_MODEL: z.string().default("glm-5"),
  GLM_BASE_URL: z.string().url().default("https://api.z.ai/api/paas/v4"),
  GLM_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  SAKANA_API_KEY: z.string().optional(),
  SAKANA_MODEL: z.string().default("fugu"),
  SAKANA_BASE_URL: z.string().url().default("https://api.sakana.ai/v1"),
  SAKANA_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  KIMI_API_KEY: z.string().optional(),
  KIMI_MODEL: z.string().default("kimi-k3"),
  KIMI_BASE_URL: z.string().url().default("https://api.moonshot.ai/v1"),
  KIMI_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  // Self-hosted OpenAI-compatible proxy (e.g. copilot-api). Setting the base
  // URL is what enables the provider; the key is a placeholder unless the
  // proxy validates one.
  COPILOT_BASE_URL: z.string().url().optional(),
  COPILOT_API_KEY: z.string().default("copilot-proxy"),
  COPILOT_MODEL: z.string().default("gpt-4.1"),
  COPILOT_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  WORD_CACHE_TTL_DAYS: z.coerce.number().int().min(0).default(0),

  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default("30d"),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Treat empty strings as unset so optional vars can be left blank in .env.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ""));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    // Print variable names only — never values.
    console.error(`Invalid or missing environment variables:\n${issues}`);
    process.exit(1);
  }
  if (parsed.data.BOT_MODE === "webhook" && !parsed.data.WEBHOOK_URL) {
    console.error("Invalid environment: WEBHOOK_URL is required when BOT_MODE=webhook");
    process.exit(1);
  }
  if (parsed.data.BOT_MODE === "webhook" && parsed.data.WEBHOOK_SECRET === "dev-webhook-secret") {
    console.error(
      "Invalid environment: WEBHOOK_SECRET must be set explicitly when BOT_MODE=webhook",
    );
    process.exit(1);
  }
  const hasProvider =
    parsed.data.GEMINI_API_KEY ||
    parsed.data.DEEPSEEK_API_KEY ||
    parsed.data.GLM_API_KEY ||
    parsed.data.SAKANA_API_KEY ||
    parsed.data.KIMI_API_KEY ||
    parsed.data.COPILOT_BASE_URL;
  if (!hasProvider) {
    console.error(
      "Invalid environment: at least one AI provider must be configured (GEMINI_API_KEY, DEEPSEEK_API_KEY, GLM_API_KEY, SAKANA_API_KEY, KIMI_API_KEY, or COPILOT_BASE_URL)",
    );
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();
