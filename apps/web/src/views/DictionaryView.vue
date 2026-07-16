<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { WordListItem } from "@vocab/shared";
import { useApi } from "../lib/api.js";
import { Flip, gsap, motionOK } from "../lib/motion.js";
import { usePracticeStore } from "../stores/practice.js";
import CefrTag from "../components/CefrTag.vue";
import ThemeToggle from "../components/ThemeToggle.vue";

const api = useApi();
const router = useRouter();
const practice = usePracticeStore();

const words = ref<WordListItem[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const search = ref("");
const posFilter = ref<string | null>(null);
const selectMode = ref(false);
const selected = ref(new Set<string>());

const posOptions = computed(() => {
  const seen = new Set<string>();
  for (const w of words.value) if (w.part_of_speech) seen.add(w.part_of_speech);
  return [...seen].sort();
});

const visible = computed(() =>
  words.value.filter((w) => {
    if (posFilter.value && w.part_of_speech !== posFilter.value) return false;
    const q = search.value.trim().toLowerCase();
    return !q || w.word.toLowerCase().includes(q) || (w.translation_ru ?? "").toLowerCase().includes(q);
  }),
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    words.value = (await api.get<{ items: WordListItem[] }>("/api/words")).items;
  } catch {
    error.value = "Couldn't load your words. Pull to retry or check the connection.";
  } finally {
    loading.value = false;
  }
  if (words.value.length && motionOK()) {
    await nextTick();
    gsap.from("[data-word-grid] li", {
      y: 16,
      opacity: 0,
      duration: 0.4,
      stagger: 0.04,
      ease: "power2.out",
      clearProps: "all",
    });
  }
}

// FLIP the grid when the filters change: capture positions pre-render
// ({ flush: "pre" }), animate from them after the DOM settles.
watch([search, posFilter], async () => {
  if (!motionOK()) return;
  const state = Flip.getState("[data-word-grid] li");
  await nextTick();
  Flip.from(state, {
    duration: 0.35,
    ease: "power2.inOut",
    absolute: true,
    onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.3 }),
    onLeave: (els) => gsap.to(els, { opacity: 0, scale: 0.95, duration: 0.2 }),
  });
}, { flush: "pre" });

function openOrToggle(word: WordListItem): void {
  if (!selectMode.value) {
    void router.push({ name: "word", params: { id: word.id } });
    return;
  }
  if (selected.value.has(word.id)) selected.value.delete(word.id);
  else selected.value.add(word.id);
}

function toggleSelectMode(): void {
  selectMode.value = !selectMode.value;
  selected.value = new Set();
}

function practiceSelected(): void {
  practice.setSelection([...selected.value]);
  void router.push({ name: "practice" });
}

function practiceAll(): void {
  practice.clearSelection();
  void router.push({ name: "practice" });
}

onMounted(load);
</script>

<template>
  <main class="mx-auto max-w-[900px] px-[clamp(16px,5vw,40px)] pb-32 pt-[clamp(16px,4vw,40px)]">
    <header class="flex flex-wrap items-baseline justify-between gap-3">
      <h1 class="font-entry text-[28px] text-ink">My dictionary</h1>
      <div class="flex items-center gap-2.5">
        <button
          v-if="words.length"
          class="cursor-pointer text-sm font-semibold text-accent"
          @click="toggleSelectMode"
        >
          {{ selectMode ? "Done" : "Select" }}
        </button>
        <ThemeToggle />
      </div>
    </header>

    <div class="relative mt-4">
      <svg
        width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-hint"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        v-model="search"
        type="search"
        placeholder="Search your words"
        class="h-[46px] w-full rounded-[14px] border border-separator bg-section pl-[42px] pr-4 text-[15px] text-ink outline-none placeholder:text-hint focus:ring-2 focus:ring-accent"
      />
    </div>

    <div v-if="posOptions.length > 1" class="mt-3.5 flex flex-wrap gap-2" data-pos-filter>
      <button
        class="h-9 cursor-pointer rounded-full px-4 text-[13px] font-semibold"
        :class="posFilter === null ? 'bg-accent text-on-accent' : 'border border-separator bg-section text-ink-2'"
        @click="posFilter = null"
      >
        all
      </button>
      <button
        v-for="pos in posOptions"
        :key="pos"
        class="h-9 cursor-pointer rounded-full px-4 text-[13px] font-semibold"
        :class="posFilter === pos ? 'bg-accent text-on-accent' : 'border border-separator bg-section text-ink-2'"
        @click="posFilter = posFilter === pos ? null : pos"
      >
        {{ pos }}
      </button>
    </div>

    <p v-if="loading" class="mt-14 text-center text-sm text-hint">Loading your words…</p>

    <div v-else-if="error" class="mt-14 text-center">
      <p class="mx-auto mb-3.5 max-w-[340px] text-sm text-danger">{{ error }}</p>
      <button
        class="grad-cta h-[42px] cursor-pointer rounded-[14px] px-5 text-sm font-semibold text-white"
        @click="load"
      >
        Try again
      </button>
    </div>

    <div v-else-if="words.length === 0" class="mt-16 text-center">
      <p class="font-entry text-[40px] text-ink-3">Aa</p>
      <p class="mx-auto mt-3 max-w-xs text-sm text-ink-3">
        No saved words yet. Send any English word to the bot and tap 💾 Save — it shows up here.
      </p>
    </div>

    <p v-else-if="visible.length === 0" class="mt-12 text-center text-sm text-hint">
      Nothing matches “{{ search }}”{{ posFilter ? ` in ${posFilter}` : "" }}.
    </p>

    <ul v-else class="mt-5 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5" data-word-grid>
      <li v-for="w in visible" :key="w.id" :data-word-id="w.id">
        <button
          class="flex w-full cursor-pointer flex-col gap-1 rounded-2xl bg-section px-[18px] py-3.5 text-left transition-[transform,box-shadow] duration-200"
          :class="selectMode && selected.has(w.id) ? 'ring-2 ring-accent -translate-y-0.5' : ''"
          @click="openOrToggle(w)"
        >
          <span class="flex items-baseline justify-between gap-2">
            <span class="font-entry text-[17px] text-ink">{{ w.word }}</span>
            <CefrTag v-if="w.cefr_guess" :level="w.cefr_guess" />
          </span>
          <span class="flex items-baseline gap-2 text-[13px]">
            <span v-if="w.part_of_speech" class="text-[11px] uppercase tracking-wider text-hint">
              {{ w.part_of_speech }}
            </span>
            <span v-if="w.translation_ru" class="italic text-ink-3">{{ w.translation_ru }}</span>
          </span>
        </button>
      </li>
    </ul>

    <!-- Practice actions: fixed bar over a bottom gradient fade. -->
    <footer
      v-if="!loading && words.length"
      class="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center bg-[linear-gradient(to_top,var(--bg-app)_55%,transparent)] p-4"
    >
      <div class="pointer-events-auto flex w-full max-w-[900px] gap-2.5">
        <button
          v-if="selectMode"
          class="grad-cta h-12 flex-1 cursor-pointer rounded-2xl text-[15px] font-bold text-white disabled:opacity-50"
          :disabled="selected.size === 0"
          @click="practiceSelected"
        >
          Practice selected ({{ selected.size }})
        </button>
        <button
          v-else
          class="grad-cta h-12 flex-1 cursor-pointer rounded-2xl text-[15px] font-bold text-white"
          @click="practiceAll"
        >
          Practice all
        </button>
      </div>
    </footer>
  </main>
</template>
