import type { SupabaseClient } from "@supabase/supabase-js";
import type { WordListItem, WordSummary } from "@vocab/shared";

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

  /** Web dictionary view: saved words with card-grid fields derived from the summary. */
  async function listSavedDetailed(userId: string, q?: string): Promise<WordListItem[]> {
    let query = supabase
      .from("user_words")
      .select("word_id, saved_at, words!inner(word, summary)")
      .eq("user_id", userId)
      .order("saved_at", { ascending: false });
    if (q) query = query.ilike("words.word", `%${q}%`);
    const { data, error } = await query;
    if (error) throw new Error(`user_words list failed: ${error.message}`);
    return (data ?? []).map((row) => {
      const word = row.words as unknown as { word: string; summary: WordSummary | null };
      return {
        id: row.word_id as string,
        word: word.word,
        part_of_speech: word.summary?.part_of_speech ?? null,
        translation_ru: word.summary?.senses[0]?.translation_ru ?? null,
        cefr_guess: word.summary?.cefr_guess ?? null,
        saved_at: row.saved_at as string,
      };
    });
  }

  /** Returns false when the word was not saved to begin with. */
  async function unsaveWord(userId: string, wordId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("user_words")
      .delete()
      .eq("user_id", userId)
      .eq("word_id", wordId)
      .select("id");
    if (error) throw new Error(`user_words delete failed: ${error.message}`);
    return (data ?? []).length > 0;
  }

  return { saveWord, isSaved, listSaved, listSavedDetailed, unsaveWord };
}

export type UserWordsRepo = ReturnType<typeof createUserWordsRepo>;
