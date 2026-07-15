import type { SupabaseClient } from "@supabase/supabase-js";

export interface UserRow {
  id: string;
  tg_id: number;
  tg_username: string | null;
  first_name: string | null;
}

export function createUsersRepo(supabase: SupabaseClient) {
  async function upsertUser(tg: {
    id: number;
    username?: string;
    first_name?: string;
  }): Promise<UserRow> {
    const { data, error } = await supabase
      .from("users")
      .upsert(
        { tg_id: tg.id, tg_username: tg.username ?? null, first_name: tg.first_name ?? null },
        { onConflict: "tg_id" },
      )
      .select()
      .single();
    if (error) throw new Error(`users upsert failed: ${error.message}`);
    return data as UserRow;
  }

  async function insertSearchHistory(entry: {
    user_id: string;
    word_id: string;
    chat_id: number;
    query_message_id: number;
    result_message_id: number;
  }): Promise<void> {
    const { error } = await supabase.from("search_history").insert(entry);
    if (error) throw new Error(`search_history insert failed: ${error.message}`);
  }

  return { upsertUser, insertSearchHistory };
}

export type UsersRepo = ReturnType<typeof createUsersRepo>;
