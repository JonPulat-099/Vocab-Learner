import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { PracticeCard, PracticeReview } from "@vocab/shared";
import { useApi } from "../lib/api.js";

export type SessionStatus = "idle" | "loading" | "error" | "active" | "finished";
export type Grade = 0 | 1;

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Dictionary multi-select + the flashcard session.
 * Empty selection means "practice all saved words".
 */
export const usePracticeStore = defineStore("practice", () => {
  const api = useApi();

  const selectedWordIds = ref<string[]>([]);

  const cards = ref<PracticeCard[]>([]);
  const index = ref(0);
  const known = ref<PracticeCard[]>([]);
  const needsWork = ref<PracticeCard[]>([]);
  const status = ref<SessionStatus>("idle");
  /** Reviews whose POST failed — retried after later grades and on results. */
  const failedReviews = ref<PracticeReview[]>([]);

  const current = computed(() => cards.value[index.value] ?? null);
  const total = computed(() => cards.value.length);
  const progressPct = computed(() =>
    total.value ? Math.round((index.value / total.value) * 100) : 0,
  );

  function setSelection(wordIds: string[]): void {
    selectedWordIds.value = wordIds;
  }

  function clearSelection(): void {
    selectedWordIds.value = [];
  }

  async function startSession(): Promise<void> {
    status.value = "loading";
    index.value = 0;
    known.value = [];
    needsWork.value = [];
    try {
      const body = {
        word_ids: selectedWordIds.value.length ? selectedWordIds.value : undefined,
        limit: 100, // queue defaults to 20 and never shuffles — "all" needs the cap
      };
      const res = await api.post<{ cards: PracticeCard[] }>("/api/practice/queue", body);
      cards.value = shuffle(res.cards);
      status.value = cards.value.length ? "active" : "error";
    } catch {
      cards.value = [];
      status.value = "error";
    }
  }

  async function postReview(review: PracticeReview): Promise<boolean> {
    try {
      await api.post("/api/practice/review", review);
      return true;
    } catch {
      return false;
    }
  }

  /** Re-send earlier failures one at a time; stop at the first miss. */
  async function flushFailedReviews(): Promise<void> {
    while (failedReviews.value.length) {
      const next = failedReviews.value[0];
      if (!(await postReview(next))) return;
      failedReviews.value.shift();
    }
  }

  function grade(g: Grade): void {
    const card = current.value;
    if (!card || status.value !== "active") return;
    (g === 1 ? known : needsWork).value.push(card);
    if (index.value + 1 >= total.value) status.value = "finished";
    else index.value += 1;

    // Optimistic: the UI advanced already; persistence catches up in the background.
    const review: PracticeReview = { user_word_id: card.user_word_id, grade: g, mode: "flashcard" };
    void postReview(review).then(async (ok) => {
      if (!ok) failedReviews.value.push(review);
      else await flushFailedReviews();
    });
  }

  function retryNeedsWork(): void {
    cards.value = shuffle(needsWork.value);
    index.value = 0;
    known.value = [];
    needsWork.value = [];
    status.value = cards.value.length ? "active" : "idle";
  }

  function reset(): void {
    cards.value = [];
    index.value = 0;
    known.value = [];
    needsWork.value = [];
    status.value = "idle";
    clearSelection();
  }

  return {
    selectedWordIds,
    setSelection,
    clearSelection,
    cards,
    index,
    known,
    needsWork,
    status,
    failedReviews,
    current,
    total,
    progressPct,
    startSession,
    grade,
    flushFailedReviews,
    retryNeedsWork,
    reset,
  };
});
