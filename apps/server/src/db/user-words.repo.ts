import type { SupabaseClient } from "@supabase/supabase-js";

export interface SavedWordItem {
  word_id: string;
  word: string;
}

export interface SavedWordsPage {
  items: SavedWordItem[];
  total: number;
}

export function createUserWordsRepo(supabase: SupabaseClient) {
  /** Idempotent: re-saving an already saved word keeps the original saved_at. */
  async function saveWord(userId: string, wordId: string): Promise<void> {
    const { error } = await supabase
      .from("user_words")
      .upsert({ user_id: userId, word_id: wordId }, { onConflict: "user_id,word_id" });
    if (error) throw new Error(`user_words upsert failed: ${error.message}`);
  }

  async function isSaved(userId: string, wordId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("user_words")
      .select("id")
      .eq("user_id", userId)
      .eq("word_id", wordId)
      .maybeSingle();
    if (error) throw new Error(`user_words lookup failed: ${error.message}`);
    return data !== null;
  }

  async function listSaved(userId: string, page: number, pageSize: number): Promise<SavedWordsPage> {
    const from = page * pageSize;
    const { data, count, error } = await supabase
      .from("user_words")
      .select("word_id, words(word)", { count: "exact" })
      .eq("user_id", userId)
      .order("saved_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`user_words list failed: ${error.message}`);
    const items = (data ?? []).map((row) => ({
      word_id: row.word_id as string,
      word: (row.words as unknown as { word: string }).word,
    }));
    return { items, total: count ?? 0 };
  }

  return { saveWord, isSaved, listSaved };
}

export type UserWordsRepo = ReturnType<typeof createUserWordsRepo>;
