import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * Carries the dictionary's multi-select over to /practice.
 * Empty selection means "practice all saved words".
 * The flashcard session itself lands here in Phase 6.
 */
export const usePracticeStore = defineStore("practice", () => {
  const selectedWordIds = ref<string[]>([]);

  function setSelection(wordIds: string[]): void {
    selectedWordIds.value = wordIds;
  }

  function clearSelection(): void {
    selectedWordIds.value = [];
  }

  return { selectedWordIds, setSelection, clearSelection };
});
