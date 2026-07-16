<script setup lang="ts">
import { useTheme } from "../composables/useTheme.js";

const { theme, toggle } = useTheme();
</script>

<template>
  <button
    type="button"
    aria-label="Toggle theme"
    class="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-separator bg-section text-ink-2"
    @click="toggle"
  >
    <!-- Light shows the moon (tap for dark), dark shows the sun. -->
    <svg
      v-if="theme === 'light'"
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  </button>
</template>
