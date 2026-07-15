<script setup lang="ts">
import { watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { hideBackButton, isInsideTelegram, showBackButton } from "./lib/telegram.js";

const route = useRoute();
const router = useRouter();

const goBack = () => {
  if (window.history.length > 1) router.back();
  else router.push({ name: "dictionary" });
};

// Native Telegram back button on every screen below the dictionary root.
watch(
  () => route.name,
  (name) => {
    if (!isInsideTelegram()) return;
    if (name === "dictionary" || name === "login") hideBackButton(goBack);
    else showBackButton(goBack);
  },
  { immediate: true },
);
</script>

<template>
  <router-view />
</template>
