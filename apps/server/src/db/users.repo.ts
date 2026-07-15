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

  /** Most recent searches, deduplicated by word (newest first). */
  async function listRecentSearches(
    userId: string,
    limit: number,
  ): Promise<Array<{ word_id: string; word: string }>> {
    const { data, error } = await supabase
      .from("search_history")
      .select("word_id, words(word)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit * 3);
    if (error) throw new Error(`search_history list failed: ${error.message}`);
    const seen = new Set<string>();
    const result: Array<{ word_id: string; word: string }> = [];
    for (const row of data ?? []) {
      const wordId = row.word_id as string;
      if (seen.has(wordId)) continue;
      seen.add(wordId);
      result.push({ word_id: wordId, word: (row.words as unknown as { word: string }).word });
      if (result.length === limit) break;
    }
    return result;
  }

  /** All stored chat/message ids for chat cleanup, oldest first. */
  async function listSearchHistoryMessages(userId: string): Promise<
    Array<{ chat_id: number | null; query_message_id: number | null; result_message_id: number | null }>
  > {
    const { data, error } = await supabase
      .from("search_history")
      .select("chat_id, query_message_id, result_message_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`search_history messages lookup failed: ${error.message}`);
    return data ?? [];
  }

  async function clearSearchHistory(userId: string): Promise<void> {
    const { error } = await supabase.from("search_history").delete().eq("user_id", userId);
    if (error) throw new Error(`search_history delete failed: ${error.message}`);
  }

  return {
    upsertUser,
    insertSearchHistory,
    listRecentSearches,
    listSearchHistoryMessages,
    clearSearchHistory,
  };
}

export type UsersRepo = ReturnType<typeof createUsersRepo>;
