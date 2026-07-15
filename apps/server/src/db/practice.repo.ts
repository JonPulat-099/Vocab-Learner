/**
 * Practice v1 (flashcards): queue building + review persistence.
 * SM-2 columns (ease, interval_days, due_at) are intentionally untouched —
 * only reps/lapses counters move for now.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PracticeCard, WordSummary } from "@vocab/shared";

export function createPracticeRepo(supabase: SupabaseClient) {
  /** Cards from the user's saved words — a picked subset or the newest saves. */
  async function getQueue(
    userId: string,
    wordIds: string[] | undefined,
    limit: number,
  ): Promise<PracticeCard[]> {
    let query = supabase
      .from("user_words")
      .select("id, word_id, words!inner(word, summary)")
      .eq("user_id", userId)
      .order("saved_at", { ascending: false })
      .limit(limit);
    if (wordIds && wordIds.length > 0) query = query.in("word_id", wordIds);
    const { data, error } = await query;
    if (error) throw new Error(`practice queue failed: ${error.message}`);
    return (data ?? []).map((row) => {
      const word = row.words as unknown as { word: string; summary: WordSummary | null };
      return {
        user_word_id: row.id as string,
        word_id: row.word_id as string,
        word: word.word,
        summary: word.summary,
      };
    });
  }

  /** Inserts a review and bumps reps (and lapses on grade 0). Rejects foreign user_word ids. */
  async function recordReview(
    userId: string,
    review: { user_word_id: string; grade: 0 | 1; mode: "flashcard" },
  ): Promise<boolean> {
    const { data: owned, error: lookupError } = await supabase
      .from("user_words")
      .select("id, reps, lapses")
      .eq("id", review.user_word_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (lookupError) throw new Error(`user_words lookup failed: ${lookupError.message}`);
    if (!owned) return false;

    const { error: insertError } = await supabase.from("practice_reviews").insert({
      user_word_id: review.user_word_id,
      grade: review.grade,
      mode: review.mode,
    });
    if (insertError) throw new Error(`practice_reviews insert failed: ${insertError.message}`);

    const { error: updateError } = await supabase
      .from("user_words")
      .update({
        reps: (owned.reps as number) + 1,
        lapses: (owned.lapses as number) + (review.grade === 0 ? 1 : 0),
      })
      .eq("id", review.user_word_id);
    if (updateError) throw new Error(`user_words counters update failed: ${updateError.message}`);
    return true;
  }

  return { getQueue, recordReview };
}

export type PracticeRepo = ReturnType<typeof createPracticeRepo>;
