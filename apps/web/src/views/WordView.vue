<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { WordDetails } from "@vocab/shared";
import { useApi } from "../lib/api.js";
import { gsap, motionOK, ScrollTrigger } from "../lib/motion.js";
import { isInsideTelegram } from "../lib/telegram.js";
import YouglishWidget from "../components/YouglishWidget.vue";
import CefrTag from "../components/CefrTag.vue";
import ThemeToggle from "../components/ThemeToggle.vue";

/** Roman numerals for sense numbering — same convention as the bot card. */
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/* Raw source payloads are `unknown` in the API contract; these are the
 * minimal shapes the page renders, checked structurally at runtime. */
interface CambridgeData {
  kind: "found";
  entries: Array<{
    headword: string;
    pos: string | null;
    ipa: string | null;
    senses: Array<{
      guideword: string | null;
      definition_en: string;
      translation_ru: string | null;
      examples: Array<{ en: string; ru: string | null }>;
    }>;
  }>;
}

interface MwEntry {
  fl?: string;
  shortdef?: string[];
  hwi?: { hw?: string; prs?: Array<{ mw?: string }> };
}

const route = useRoute();
const router = useRouter();
const api = useApi();

const details = ref<WordDetails | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const removing = ref(false);
const confirmRemove = ref(false);
const showRawSources = ref(false);

// Native BackButton covers navigation inside Telegram; browsers get a text link.
const showBackLink = !isInsideTelegram();

const cambridge = computed<CambridgeData | null>(() => {
  const data = details.value?.cambridge_data as CambridgeData | null | undefined;
  return data && data.kind === "found" && Array.isArray(data.entries) ? data : null;
});

const mwEntries = computed<MwEntry[]>(() => {
  const data = details.value?.mw_data;
  if (!Array.isArray(data)) return [];
  return (data as MwEntry[]).filter((e) => Array.isArray(e.shortdef) && e.shortdef.length > 0);
});

onMounted(async () => {
  try {
    details.value = await api.get<WordDetails>(`/api/words/${String(route.params.id)}`);
  } catch {
    error.value = "This word isn't in the dictionary cache. Search it in the bot first.";
  } finally {
    loading.value = false;
  }
  if (details.value && motionOK()) {
    await nextTick();
    // Sections drift in as the entry is scrolled — one trigger per section.
    for (const el of document.querySelectorAll("[data-reveal]")) {
      gsap.from(el, {
        opacity: 0,
        y: 24,
        duration: 0.5,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 88%" },
      });
    }
  }
});

onUnmounted(() => {
  for (const trigger of ScrollTrigger.getAll()) trigger.kill();
});

async function removeWord(): Promise<void> {
  if (!details.value) return;
  removing.value = true;
  try {
    await api.del(`/api/words/${details.value.id}`);
    await router.replace({ name: "dictionary" });
  } catch {
    removing.value = false;
    error.value = "Couldn't remove the word — try again.";
  }
}
</script>

<template>
  <main class="mx-auto max-w-[720px] px-[clamp(16px,5vw,40px)] pb-20 pt-[clamp(16px,4vw,40px)]">
    <div class="flex items-center justify-between" :class="showBackLink ? '' : 'justify-end'">
      <button
        v-if="showBackLink"
        class="flex cursor-pointer items-center gap-1.5 py-2 text-sm font-semibold text-accent"
        @click="router.back()"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Dictionary
      </button>
      <ThemeToggle />
    </div>

    <p v-if="loading" class="mt-10 text-center text-hint">Opening the entry…</p>
    <p v-else-if="error && !details" class="mt-10 text-center text-danger">{{ error }}</p>

    <template v-else-if="details">
      <!-- Entry header: print-dictionary voice -->
      <header class="mt-2" data-reveal>
        <h1 class="flex flex-wrap items-baseline gap-2.5 font-entry text-4xl leading-tight text-ink">
          {{ details.summary?.word ?? details.word }}
          <span v-if="details.summary?.forms.length" class="text-[17px] text-hint">
            ({{ details.summary.forms.join(", ") }})
          </span>
        </h1>
        <p class="mt-2 flex flex-wrap items-baseline gap-x-3 text-sm">
          <span v-if="details.summary?.transcription" class="font-entry text-hint">
            {{ details.summary.transcription }}
          </span>
          <span v-if="details.summary?.part_of_speech" class="text-xs uppercase tracking-wider text-hint">
            {{ details.summary.part_of_speech }}
          </span>
          <CefrTag v-if="details.summary?.cefr_guess" :level="details.summary.cefr_guess" />
        </p>
      </header>

      <!-- AI summary: full EN+RU pairs (the bot card shows EN only) -->
      <section v-if="details.summary" class="mt-7" data-reveal>
        <h2 class="text-[11px] font-semibold uppercase tracking-[0.12em] text-hint">Summary</h2>
        <article
          v-for="(sense, i) in details.summary.senses"
          :key="i"
          class="mt-3.5 rounded-2xl bg-section px-[18px] py-4"
        >
          <h3 class="flex flex-wrap items-baseline gap-2 text-base font-normal text-ink">
            <span class="font-entry font-bold">{{ ROMAN[i] ?? i + 1 }}.</span>
            <span v-if="sense.guideword" class="text-[11px] uppercase tracking-wider text-hint">
              ({{ sense.guideword }})
            </span>
            <span>{{ sense.definition_en }}</span>
          </h3>
          <p class="mt-1.5 text-sm italic text-ink-3">
            — {{ sense.translation_ru }}<template v-if="sense.translation_uz"> · {{ sense.translation_uz }}</template>
          </p>
          <ol class="mt-3 space-y-2">
            <li v-for="(ex, j) in sense.examples" :key="j" class="text-sm">
              <p class="text-ink">{{ ex.en }}</p>
              <p class="mt-0.5 italic text-ink-3">{{ ex.ru }}</p>
            </li>
          </ol>
        </article>

        <p v-if="details.summary.synonyms.length" class="mt-4 text-sm text-ink-2">
          <span class="text-hint">≈</span> {{ details.summary.synonyms.join(", ") }}
        </p>

        <div v-if="details.summary.idioms.length" class="mt-4 rounded-2xl bg-section px-[18px] py-4">
          <h3 class="text-[11px] font-semibold uppercase tracking-[0.1em] text-hint">Idioms</h3>
          <ul class="mt-2.5 space-y-2.5 text-sm">
            <li v-for="idiom in details.summary.idioms" :key="idiom.phrase">
              <p class="font-semibold text-ink">{{ idiom.phrase }}</p>
              <p class="mt-0.5 text-ink-2">{{ idiom.definition_en }}</p>
              <p class="mt-0.5 text-[13px] italic text-ink-3">
                {{ idiom.translation_ru }}<template v-if="idiom.translation_uz"> · {{ idiom.translation_uz }}</template>
              </p>
            </li>
          </ul>
        </div>

        <p
          v-if="details.summary.usage_note"
          class="mt-4 border-l-2 border-border-2 px-3.5 py-2.5 text-[13px] italic text-ink-3"
        >
          {{ details.summary.usage_note }}
        </p>
      </section>

      <!-- Raw sources, collapsed behind one toggle -->
      <section v-if="cambridge || mwEntries.length" class="mt-6">
        <button
          class="flex w-full cursor-pointer items-center justify-between rounded-[14px] border border-separator bg-section px-4 py-3 text-[13px] font-semibold text-ink-2"
          @click="showRawSources = !showRawSources"
        >
          <span>Original sources (Cambridge · Merriam-Webster)</span>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
            class="transition-transform duration-200"
            :class="showRawSources ? 'rotate-180' : ''"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        <div v-if="showRawSources" class="mt-3 flex flex-col gap-4">
          <!-- Cambridge raw -->
          <div v-if="cambridge" class="border-l-2 border-border-2 pl-3.5">
            <h2 class="text-[11px] font-semibold uppercase tracking-[0.1em] text-hint">Cambridge</h2>
            <article v-for="(entry, i) in cambridge.entries" :key="i" class="mt-1.5">
              <h3 class="flex flex-wrap items-baseline gap-2 text-sm">
                <span class="font-entry text-base">{{ entry.headword }}</span>
                <span v-if="entry.pos" class="text-[11px] uppercase tracking-wider text-hint">{{ entry.pos }}</span>
                <span v-if="entry.ipa" class="font-entry text-hint">{{ entry.ipa }}</span>
              </h3>
              <div v-for="(sense, j) in entry.senses" :key="j" class="mt-1.5 text-sm">
                <p class="text-ink">
                  <span v-if="sense.guideword" class="text-[11px] uppercase tracking-wider text-hint">
                    ({{ sense.guideword }})
                  </span>
                  {{ sense.definition_en }}
                  <span v-if="sense.translation_ru" class="italic text-ink-3"> — {{ sense.translation_ru }}</span>
                </p>
                <ul class="mt-1 space-y-1">
                  <li v-for="(ex, k) in sense.examples" :key="k" class="text-[13px] text-ink-3">
                    {{ ex.en }}<span v-if="ex.ru" class="italic"> — {{ ex.ru }}</span>
                  </li>
                </ul>
              </div>
            </article>
          </div>

          <!-- Merriam-Webster raw -->
          <div v-if="mwEntries.length" class="border-l-2 border-border-2 pl-3.5">
            <h2 class="text-[11px] font-semibold uppercase tracking-[0.1em] text-hint">Merriam-Webster</h2>
            <article v-for="(entry, i) in mwEntries" :key="i" class="mt-1.5 text-sm">
              <h3 class="flex flex-wrap items-baseline gap-2">
                <span class="font-entry text-base">{{ entry.hwi?.hw?.replaceAll("*", "·") ?? details.word }}</span>
                <span v-if="entry.fl" class="text-[11px] uppercase tracking-wider text-hint">{{ entry.fl }}</span>
                <span v-if="entry.hwi?.prs?.[0]?.mw" class="font-entry text-hint">/{{ entry.hwi.prs[0].mw }}/</span>
              </h3>
              <ol class="mt-1 list-decimal space-y-1 pl-5">
                <li v-for="(def, j) in entry.shortdef" :key="j" class="text-ink">{{ def }}</li>
              </ol>
            </article>
          </div>
        </div>
      </section>

      <!-- YouGlish -->
      <section class="mt-6" data-reveal>
        <h2 class="text-[11px] font-semibold uppercase tracking-[0.12em] text-hint">Pronunciation in the wild</h2>
        <div class="mt-3 overflow-hidden rounded-2xl bg-section p-2">
          <YouglishWidget :word="details.word" />
        </div>
      </section>

      <p v-if="error" class="mt-6 text-sm text-danger">{{ error }}</p>

      <div
        v-if="confirmRemove"
        class="mt-7 flex flex-col gap-2.5 rounded-2xl border border-danger p-4"
      >
        <p class="text-sm text-ink">Remove “{{ details.summary?.word ?? details.word }}” from your dictionary?</p>
        <div class="flex gap-2.5">
          <button
            class="h-11 flex-1 cursor-pointer rounded-[14px] border border-separator font-semibold text-ink-2"
            :disabled="removing"
            @click="confirmRemove = false"
          >
            Cancel
          </button>
          <button
            class="h-11 flex-1 cursor-pointer rounded-[14px] bg-danger font-semibold text-white disabled:opacity-50"
            :disabled="removing"
            @click="removeWord"
          >
            Remove
          </button>
        </div>
      </div>
      <button
        v-else
        class="mt-7 h-12 w-full cursor-pointer rounded-2xl border border-separator font-semibold text-danger"
        @click="confirmRemove = true"
      >
        Remove from my dictionary
      </button>
    </template>
  </main>
</template>
