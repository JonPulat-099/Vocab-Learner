import { ref, type Ref } from "vue";
import { getTelegramWebApp, isInsideTelegram } from "../lib/telegram.js";

export type Theme = "light" | "dark";

const THEME_KEY = "vocab_theme";

const theme = ref<Theme>("light");

function apply(next: Theme): void {
  theme.value = next;
  document.documentElement.dataset.theme = next;
}

function detect(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  if (isInsideTelegram()) return getTelegramWebApp()?.colorScheme === "dark" ? "dark" : "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Call once before mount; index.html applies the same choice pre-paint. */
export function initTheme(): void {
  apply(detect());
}

export function useTheme(): { theme: Ref<Theme>; toggle: () => void } {
  function toggle(): void {
    const next: Theme = theme.value === "light" ? "dark" : "light";
    localStorage.setItem(THEME_KEY, next);
    apply(next);
  }
  return { theme, toggle };
}
