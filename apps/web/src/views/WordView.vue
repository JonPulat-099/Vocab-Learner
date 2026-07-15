<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { WordDetails } from "@vocab/shared";
import { useApi } from "../lib/api.js";
import YouglishWidget from "../components/YouglishWidget.vue";

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
  <main class="mx-auto max-w-2xl px-4 pb-16 pt-4">
    <p v-if="loading" class="mt-10 text-center text-hint">Opening the entry…</p>
    <p v-else-if="error && !details" class="mt-10 text-center text-danger">{{ error }}</p>

    <template v-else-if="details">
      <!-- Entry header: print-dictionary voice -->
      <header data-reveal>
        <h1 class="font-entry text-4xl leading-tight">
          {{ details.summary?.word ?? details.word }}
          <span v-if="details.summary?.forms.length" class="text-xl text-hint">
            ({{ details.summary.forms.join(", ") }})
          </span>
        </h1>
        <p class="mt-1 flex flex-wrap items-baseline gap-x-3 text-sm">
          <span v-if="details.summary?.transcription" class="font-entry text-hint">
            {{ details.summary.transcription }}
          </span>
          <span v-if="details.summary?.part_of_speech" class="uppercase tracking-wide text-xs text-hint">
            {{ details.summary.part_of_speech }}
          </span>
          <span
            v-if="details.summary?.cefr_guess"
            class="rounded-md bg-accent/15 px-1.5 py-0.5 text-xs font-medium text-link"
          >
            {{ details.summary.cefr_guess }}
          </span>
        </p>
      </header>

      <!-- AI summary: full EN+RU pairs (the bot card shows EN only) -->
      <section v-if="details.summary" class="mt-6" data-reveal>
        <h2 class="text-xs font-medium uppercase tracking-widest text-hint">Summary</h2>
        <article
          v-for="(sense, i) in details.summary.senses"
          :key="i"
          class="mt-4 rounded-xl bg-section p-4"
        >
          <h3 class="flex items-baseline gap-2">
            <span class="font-entry font-bold">{{ ROMAN[i] ?? i + 1 }}.</span>
            <span v-if="sense.guideword" class="text-xs uppercase tracking-wide text-hint">
              ({{ sense.guideword }})
            </span>
            <span>{{ sense.definition_en }}</span>
          </h3>
          <p class="mt-1 text-sm italic text-hint">
            — {{ sense.translation_ru }}<template v-if="sense.translation_uz"> · {{ sense.translation_uz }}</template>
          </p>
          <ol class="mt-3 space-y-2">
            <li v-for="(ex, j) in sense.examples" :key="j" class="text-sm">
              <p>{{ j + 1 }}. {{ ex.en }}</p>
              <p class="italic text-hint">{{ ex.ru }}</p>
            </li>
          </ol>
        </article>

        <p v-if="details.summary.synonyms.length" class="mt-4 text-sm">
          <span class="text-hint">≈</span> {{ details.summary.synonyms.join(", ") }}
        </p>

        <div v-if="details.summary.idioms.length" class="mt-4 rounded-xl bg-section p-4">
          <h3 class="text-xs font-medium uppercase tracking-widest text-hint">Idioms</h3>
          <ul class="mt-2 space-y-2 text-sm">
            <li v-for="idiom in details.summary.idioms" :key="idiom.phrase">
              <p class="font-medium">{{ idiom.phrase }}</p>
              <p>{{ idiom.definition_en }}</p>
              <p class="italic text-hint">
                {{ idiom.translation_ru }}<template v-if="idiom.translation_uz"> · {{ idiom.translation_uz }}</template>
              </p>
            </li>
          </ul>
        </div>

        <p v-if="details.summary.usage_note" class="mt-4 text-sm italic text-hint">
          💡 {{ details.summary.usage_note }}
        </p>
      </section>

      <!-- Cambridge raw -->
      <section v-if="cambridge" class="mt-8" data-reveal>
        <h2 class="text-xs font-medium uppercase tracking-widest text-hint">Cambridge</h2>
        <article
          v-for="(entry, i) in cambridge.entries"
          :key="i"
          class="mt-3 border-l-2 border-separator pl-3"
        >
          <h3 class="flex items-baseline gap-2 text-sm">
            <span class="font-entry text-base">{{ entry.headword }}</span>
            <span v-if="entry.pos" class="uppercase tracking-wide text-xs text-hint">{{ entry.pos }}</span>
            <span v-if="entry.ipa" class="font-entry text-hint">{{ entry.ipa }}</span>
          </h3>
          <div v-for="(sense, j) in entry.senses" :key="j" class="mt-2 text-sm">
            <p>
              <span v-if="sense.guideword" class="text-xs uppercase tracking-wide text-hint">
                ({{ sense.guideword }})
              </span>
              {{ sense.definition_en }}
              <span v-if="sense.translation_ru" class="italic text-hint"> — {{ sense.translation_ru }}</span>
            </p>
            <ul class="mt-1 space-y-1">
              <li v-for="(ex, k) in sense.examples" :key="k" class="text-hint">
                {{ ex.en }}<span v-if="ex.ru" class="italic"> — {{ ex.ru }}</span>
              </li>
            </ul>
          </div>
        </article>
      </section>

      <!-- Merriam-Webster raw -->
      <section v-if="mwEntries.length" class="mt-8" data-reveal>
        <h2 class="text-xs font-medium uppercase tracking-widest text-hint">Merriam-Webster</h2>
        <article
          v-for="(entry, i) in mwEntries"
          :key="i"
          class="mt-3 border-l-2 border-separator pl-3 text-sm"
        >
          <h3 class="flex items-baseline gap-2">
            <span class="font-entry text-base">{{ entry.hwi?.hw?.replaceAll("*", "·") ?? details.word }}</span>
            <span v-if="entry.fl" class="uppercase tracking-wide text-xs text-hint">{{ entry.fl }}</span>
            <span v-if="entry.hwi?.prs?.[0]?.mw" class="font-entry text-hint">/{{ entry.hwi.prs[0].mw }}/</span>
          </h3>
          <ol class="mt-1 list-decimal space-y-1 pl-5">
            <li v-for="(def, j) in entry.shortdef" :key="j">{{ def }}</li>
          </ol>
        </article>
      </section>

      <!-- YouGlish -->
      <section class="mt-8" data-reveal>
        <h2 class="text-xs font-medium uppercase tracking-widest text-hint">Pronunciation in the wild</h2>
        <div class="mt-3 overflow-hidden rounded-xl bg-section p-2">
          <YouglishWidget :word="details.word" />
        </div>
      </section>

      <p v-if="error" class="mt-6 text-sm text-danger">{{ error }}</p>

      <button
        class="mt-8 w-full rounded-xl bg-section px-4 py-2.5 text-danger disabled:opacity-50"
        :disabled="removing"
        @click="removeWord"
      >
        Remove from my dictionary
      </button>
    </template>
  </main>
</template>
