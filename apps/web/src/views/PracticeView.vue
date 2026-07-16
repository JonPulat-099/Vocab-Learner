<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { usePracticeStore, type Grade } from "../stores/practice.js";
import FlashCard from "../components/FlashCard.vue";
import ThemeToggle from "../components/ThemeToggle.vue";

const router = useRouter();
const practice = usePracticeStore();

const cardRef = ref<InstanceType<typeof FlashCard> | null>(null);

function onGrade(g: Grade): void {
  practice.grade(g);
}

function gradeViaButton(g: Grade): void {
  cardRef.value?.swipeOut(g);
}

function close(): void {
  practice.reset();
  void router.replace({ name: "dictionary" });
}

function onKey(e: KeyboardEvent): void {
  if (practice.status !== "active") return;
  if (e.code === "Space") {
    e.preventDefault();
    cardRef.value?.flip();
  } else if (e.code === "ArrowRight") {
    gradeViaButton(1);
  } else if (e.code === "ArrowLeft") {
    gradeViaButton(0);
  }
}

watch(
  () => practice.status,
  (status) => {
    if (status === "finished") void router.replace({ name: "practice-results" });
  },
);

onMounted(() => {
  window.addEventListener("keydown", onKey);
  // A retry session arrives pre-seeded from the results screen.
  if (practice.status !== "active") void practice.startSession();
});

onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-[520px] flex-col px-[clamp(16px,5vw,40px)] pb-10 pt-[clamp(16px,4vw,40px)]">
    <div class="flex items-center justify-between">
      <button
        aria-label="Close"
        class="grid size-10 cursor-pointer place-items-center rounded-full border border-separator bg-section text-ink-2"
        @click="close"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
      <span v-if="practice.total" class="text-[13px] font-semibold text-hint">
        {{ practice.index + 1 }} / {{ practice.total }}
      </span>
      <ThemeToggle />
    </div>

    <div class="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        class="grad-cta h-full rounded-full transition-[width] duration-300 ease-[var(--ease-standard)]"
        :style="{ width: `${practice.progressPct}%` }"
      />
    </div>

    <p v-if="practice.status === 'loading'" class="mt-14 text-center text-sm text-hint">
      Shuffling your cards…
    </p>

    <div v-else-if="practice.status === 'error'" class="mt-14 text-center">
      <p class="mx-auto mb-3.5 max-w-[340px] text-sm text-danger">
        Couldn't build a practice deck. Save some words first, or try again.
      </p>
      <button
        class="grad-cta h-[42px] cursor-pointer rounded-[14px] px-5 text-sm font-semibold text-white"
        @click="practice.startSession()"
      >
        Try again
      </button>
    </div>

    <template v-else-if="practice.status === 'active' && practice.current">
      <div class="mt-6 flex min-h-0 flex-1 items-center justify-center">
        <FlashCard ref="cardRef" :card="practice.current" @grade="onGrade" />
      </div>

      <div class="mt-6 flex gap-3">
        <button
          class="flex h-[52px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-separator bg-section text-[15px] font-bold text-danger"
          @click="gradeViaButton(0)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          Don't know
        </button>
        <button
          class="grad-cta flex h-[52px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white"
          @click="gradeViaButton(1)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Know
        </button>
      </div>
      <p class="mt-3 text-center text-xs text-faint">Swipe, tap the card, or use ← / → / space</p>
    </template>
  </main>
</template>
