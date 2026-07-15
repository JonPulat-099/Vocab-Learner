<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { WordListItem } from "@vocab/shared";
import { useApi } from "../lib/api.js";
import { Flip, gsap, motionOK } from "../lib/motion.js";
import { usePracticeStore } from "../stores/practice.js";

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
  <main class="mx-auto max-w-2xl px-4 pb-24 pt-4">
    <header class="flex items-baseline justify-between gap-2">
      <h1 class="font-entry text-2xl">My dictionary</h1>
      <button
        v-if="words.length"
        class="text-sm text-link"
        @click="toggleSelectMode"
      >
        {{ selectMode ? "Done" : "Select" }}
      </button>
    </header>

    <input
      v-model="search"
      type="search"
      placeholder="Search your words"
      class="mt-3 w-full rounded-xl bg-section px-4 py-2.5 text-base outline-none placeholder:text-hint focus:ring-2 focus:ring-accent"
    />

    <div v-if="posOptions.length > 1" class="mt-3 flex flex-wrap gap-2" data-pos-filter>
      <button
        class="rounded-full px-3 py-1 text-sm"
        :class="posFilter === null ? 'bg-accent text-on-accent' : 'bg-section text-hint'"
        @click="posFilter = null"
      >
        all
      </button>
      <button
        v-for="pos in posOptions"
        :key="pos"
        class="rounded-full px-3 py-1 text-sm"
        :class="posFilter === pos ? 'bg-accent text-on-accent' : 'bg-section text-hint'"
        @click="posFilter = posFilter === pos ? null : pos"
      >
        {{ pos }}
      </button>
    </div>

    <p v-if="loading" class="mt-10 text-center text-hint">Loading your words…</p>
    <p v-else-if="error" class="mt-10 text-center text-danger">{{ error }}</p>

    <div v-else-if="words.length === 0" class="mt-14 text-center">
      <p class="font-entry text-4xl">Aa</p>
      <p class="mt-3 text-hint">
        No saved words yet. Send any English word to the bot and tap 💾 Save — it shows up here.
      </p>
    </div>

    <p v-else-if="visible.length === 0" class="mt-10 text-center text-hint">
      Nothing matches “{{ search }}”{{ posFilter ? ` in ${posFilter}` : "" }}.
    </p>

    <ul v-else class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2" data-word-grid>
      <li v-for="w in visible" :key="w.id" :data-word-id="w.id">
        <button
          class="w-full rounded-xl bg-section px-4 py-3 text-left transition-shadow"
          :class="selectMode && selected.has(w.id) ? 'ring-2 ring-accent' : ''"
          @click="openOrToggle(w)"
        >
          <span class="flex items-baseline justify-between gap-2">
            <span class="font-entry text-lg">{{ w.word }}</span>
            <span
              v-if="w.cefr_guess"
              class="rounded-md bg-accent/15 px-1.5 py-0.5 text-xs font-medium text-link"
            >
              {{ w.cefr_guess }}
            </span>
          </span>
          <span class="mt-0.5 flex items-baseline gap-2 text-sm">
            <span v-if="w.part_of_speech" class="uppercase tracking-wide text-hint text-xs">
              {{ w.part_of_speech }}
            </span>
            <span v-if="w.translation_ru" class="italic text-hint">{{ w.translation_ru }}</span>
          </span>
        </button>
      </li>
    </ul>

    <!-- Practice actions: fixed footer, native-button colors. -->
    <footer
      v-if="!loading && words.length"
      class="fixed inset-x-0 bottom-0 mx-auto flex max-w-2xl gap-2 bg-base/90 px-4 py-3 backdrop-blur"
    >
      <button
        v-if="selectMode"
        class="flex-1 rounded-xl bg-accent px-4 py-2.5 font-medium text-on-accent disabled:opacity-50"
        :disabled="selected.size === 0"
        @click="practiceSelected"
      >
        Practice selected ({{ selected.size }})
      </button>
      <button
        v-else
        class="flex-1 rounded-xl bg-accent px-4 py-2.5 font-medium text-on-accent"
        @click="practiceAll"
      >
        Practice all
      </button>
    </footer>
  </main>
</template>
