<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { usePracticeStore } from "../stores/practice.js";
import ThemeToggle from "../components/ThemeToggle.vue";

const router = useRouter();
const practice = usePracticeStore();

// Reload / deep-link: there is no finished session to show.
if (practice.status !== "finished") {
  void router.replace({ name: "dictionary" });
}

function retry(): void {
  practice.retryNeedsWork();
  void router.replace({ name: "practice" });
}

function done(): void {
  practice.reset();
  void router.replace({ name: "dictionary" });
}

onMounted(() => void practice.flushFailedReviews());
</script>

<template>
  <main class="mx-auto max-w-[560px] px-[clamp(16px,5vw,40px)] pb-16 pt-[clamp(16px,4vw,40px)] text-center">
    <div class="flex justify-end">
      <ThemeToggle />
    </div>

    <h1 class="mt-2 font-entry text-[30px] text-ink">Session complete</h1>

    <div class="mt-6 flex justify-center gap-4">
      <div class="max-w-[180px] flex-1 rounded-2xl bg-success-soft p-5">
        <p class="text-[32px] font-bold text-accent">{{ practice.known.length }}</p>
        <p class="mt-1 text-[13px] text-ink-3">Know</p>
      </div>
      <div class="max-w-[180px] flex-1 rounded-2xl bg-muted p-5">
        <p class="text-[32px] font-bold text-ink">{{ practice.needsWork.length }}</p>
        <p class="mt-1 text-[13px] text-ink-3">Needs work</p>
      </div>
    </div>

    <div v-if="practice.needsWork.length" class="mt-8 text-left">
      <h2 class="text-[11px] font-semibold uppercase tracking-[0.1em] text-hint">Needs work</h2>
      <div class="mt-2.5 flex flex-wrap gap-2">
        <span
          v-for="card in practice.needsWork"
          :key="card.user_word_id"
          class="rounded-full bg-section px-3.5 py-1.5 font-entry text-[13px] text-ink-2"
        >
          {{ card.word }}
        </span>
      </div>
    </div>

    <p v-if="practice.failedReviews.length" class="mt-6 text-xs text-hint">
      {{ practice.failedReviews.length }}
      {{ practice.failedReviews.length === 1 ? "review" : "reviews" }} will sync when the connection is back.
    </p>

    <div class="mt-8 flex gap-3">
      <button
        v-if="practice.needsWork.length"
        class="h-[50px] flex-1 cursor-pointer rounded-2xl border border-separator bg-section font-bold text-ink"
        @click="retry"
      >
        Retry needs-work
      </button>
      <button
        class="grad-cta h-[50px] flex-1 cursor-pointer rounded-2xl font-bold text-white"
        @click="done"
      >
        Done
      </button>
    </div>
  </main>
</template>
