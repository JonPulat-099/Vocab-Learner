<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { TelegramLoginPayload } from "@vocab/shared";
import { getTelegramWebApp } from "../lib/telegram.js";
import { useAuthStore } from "../stores/auth.js";
import ThemeToggle from "../components/ThemeToggle.vue";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const error = ref<string | null>(null);
const busy = ref(false);
const widgetHost = ref<HTMLElement | null>(null);

const isDev = import.meta.env.DEV;

async function finishLogin(login: () => Promise<void>): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    await login();
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/dictionary";
    await router.replace(redirect);
  } catch {
    error.value = "Sign-in didn't go through. This app only works for its owner's Telegram account.";
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  // Inside Telegram the guard normally signs in silently before this page is
  // ever shown; if we still land here, retry once (e.g. after a logout).
  const initData = getTelegramWebApp()?.initData;
  if (initData) {
    void finishLogin(() => auth.loginWithInitData(initData));
    return;
  }

  // Plain browser: render the Telegram Login Widget.
  window.onTelegramAuth = (payload: TelegramLoginPayload) => {
    void finishLogin(() => auth.loginWithWidget(payload));
  };
  const script = document.createElement("script");
  script.src = "https://telegram.org/js/telegram-widget.js?22";
  script.async = true;
  script.setAttribute("data-telegram-login", import.meta.env.VITE_TG_BOT_USERNAME);
  script.setAttribute("data-size", "large");
  script.setAttribute("data-radius", "10");
  script.setAttribute("data-onauth", "onTelegramAuth(user)");
  widgetHost.value?.appendChild(script);
});

declare global {
  interface Window {
    onTelegramAuth?: (payload: TelegramLoginPayload) => void;
  }
}
</script>

<template>
  <main class="relative flex min-h-dvh flex-col items-center justify-center px-8 text-center">
    <div class="absolute right-5 top-5">
      <ThemeToggle />
    </div>

    <p class="font-entry text-[56px] leading-none text-accent">Aa</p>
    <h1 class="mt-4 font-display text-[28px] font-bold text-ink">Vocab Learner</h1>
    <p class="mt-1.5 max-w-xs text-sm leading-relaxed text-ink-3">
      Your saved words, full dictionary entries and flashcards — signed in with Telegram.
    </p>

    <div ref="widgetHost" class="mt-8 min-h-10" />

    <p v-if="busy" class="mt-4 text-sm text-hint">Signing in…</p>
    <p v-if="error" class="mt-4 max-w-xs text-sm text-danger">{{ error }}</p>

    <button
      v-if="isDev"
      class="mt-3.5 h-10 cursor-pointer px-4 text-[13px] text-hint"
      :disabled="busy"
      @click="finishLogin(() => auth.loginDev())"
    >
      Dev sign-in (localhost)
    </button>
  </main>
</template>
