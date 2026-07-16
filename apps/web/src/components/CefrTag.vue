<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ level: string }>();

// Literal class map so Tailwind sees every class name.
const TONE_CLASSES: Record<string, string> = {
  mint: "bg-tag-mint-bg text-tag-mint-fg",
  blue: "bg-tag-blue-bg text-tag-blue-fg",
  lilac: "bg-tag-lilac-bg text-tag-lilac-fg",
  peach: "bg-tag-peach-bg text-tag-peach-fg",
  pink: "bg-tag-pink-bg text-tag-pink-fg",
};

const TONE_FOR_CEFR: Record<string, string> = {
  A1: "mint",
  A2: "mint",
  B1: "blue",
  B2: "lilac",
  C1: "peach",
  C2: "pink",
};

const classes = computed(() => TONE_CLASSES[TONE_FOR_CEFR[props.level] ?? "blue"]);
</script>

<template>
  <span class="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold" :class="classes">
    {{ level }}
  </span>
</template>
