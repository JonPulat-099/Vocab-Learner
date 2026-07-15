import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  BOT_TOKEN: z.string().min(1),
  BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
  WEBHOOK_URL: z.string().url().optional(),
  WEBHOOK_SECRET: z.string().min(1).default("dev-webhook-secret"),
  OWNER_TG_ID: z.coerce.number().int(),

  MW_API_KEY: z.string().min(1),
  CAMBRIDGE_BASE_URL: z
    .string()
    .url()
    .default("https://dictionary.cambridge.org/dictionary/english-russian"),
  SOURCE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  YOUGLISH_API_KEY: z.string().optional(),

  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

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
  return parsed.data;
}

export const config = loadConfig();
