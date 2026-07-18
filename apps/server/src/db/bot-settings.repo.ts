import type { SupabaseClient } from "@supabase/supabase-js";

const ACTIVE_MODEL_KEY = "active_model";
const DEFAULT_MODEL = "gemini";

export function createBotSettingsRepo(supabase: SupabaseClient) {
  async function getActiveModel(): Promise<string> {
    const { data, error } = await supabase
      .from("bot_settings")
      .select("value")
      .eq("key", ACTIVE_MODEL_KEY)
      .maybeSingle();
    if (error) throw new Error(`bot_settings lookup failed: ${error.message}`);
    return (data?.value as string | undefined) ?? DEFAULT_MODEL;
  }

  async function setActiveModel(modelId: string): Promise<void> {
    const { error } = await supabase
      .from("bot_settings")
      .upsert(
        { key: ACTIVE_MODEL_KEY, value: modelId, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw new Error(`bot_settings upsert failed: ${error.message}`);
  }

  return { getActiveModel, setActiveModel };
}

export type BotSettingsRepo = ReturnType<typeof createBotSettingsRepo>;
