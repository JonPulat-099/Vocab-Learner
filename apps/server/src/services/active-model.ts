import type { BotSettingsRepo } from "../db/bot-settings.repo.js";

/**
 * In-memory holder for the globally-active summarization model, so the bot
 * never hits the DB on the search path. Loaded once at boot; set() persists
 * the change so it survives restarts.
 */
export interface ActiveModelHolder {
  get(): string;
  set(modelId: string): Promise<void>;
}

export function createActiveModelHolder(
  initial: string,
  repo: BotSettingsRepo,
): ActiveModelHolder {
  let current = initial;
  return {
    get: () => current,
    async set(modelId) {
      current = modelId;
      await repo.setActiveModel(modelId);
    },
  };
}
