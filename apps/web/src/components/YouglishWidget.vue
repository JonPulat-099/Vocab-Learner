<script setup lang="ts">
import { onMounted, ref } from "vue";

/**
 * Official YouGlish JS widget (youglish.com/api). The script scans the page
 * for `.youglish-widget` anchors when it executes; re-appending it on each
 * mount makes it re-scan after SPA navigation. Falls back to a plain link
 * (the anchor href) when the script can't load.
 */
const props = defineProps<{ word: string }>();

const host = ref<HTMLElement | null>(null);
const lang = import.meta.env.VITE_YOUGLISH_LANG ?? "english";

onMounted(() => {
  const anchor = document.createElement("a");
  anchor.id = "yg-widget-0";
  anchor.className = "youglish-widget";
  anchor.rel = "nofollow";
  anchor.href = `https://youglish.com/pron/${encodeURIComponent(props.word)}/${lang}`;
  anchor.textContent = `Hear “${props.word}” on YouGlish`;
  anchor.setAttribute("data-query", props.word);
  anchor.setAttribute("data-lang", lang);
  anchor.setAttribute("data-zones", "all,us,uk,aus");
  anchor.setAttribute("data-auto-start", "0");
  host.value?.appendChild(anchor);

  const script = document.createElement("script");
  script.src = "https://youglish.com/public/emb/widget.js";
  script.async = true;
  script.charset = "utf-8";
  host.value?.appendChild(script);
});
</script>

<template>
  <div ref="host" class="min-h-24 text-link" />
</template>
