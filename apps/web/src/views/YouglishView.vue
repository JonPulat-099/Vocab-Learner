<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import YouglishWidget from "../components/YouglishWidget.vue";

// Opened from the bot's 🎧 button inside Telegram — deliberately no auth:
// it renders nothing personal, just the public YouGlish player for one word.
const route = useRoute();
const word = computed(() => String(route.params.word ?? ""));
</script>

<template>
  <main class="mx-auto max-w-2xl px-4 pb-10 pt-6">
    <h1 class="font-entry text-3xl">{{ word }}</h1>
    <p class="mt-1 text-sm text-hint">Real people saying it, one clip at a time.</p>
    <div class="mt-4 overflow-hidden rounded-xl bg-section p-2">
      <YouglishWidget v-if="word" :word="word" />
    </div>
  </main>
</template>
