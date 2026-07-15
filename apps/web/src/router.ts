import { createRouter, createWebHistory } from "vue-router";
import { getTelegramWebApp } from "./lib/telegram.js";
import { useAuthStore } from "./stores/auth.js";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/dictionary" },
    {
      path: "/login",
      name: "login",
      component: () => import("./views/LoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/dictionary",
      name: "dictionary",
      component: () => import("./views/DictionaryView.vue"),
    },
    {
      path: "/word/:id",
      name: "word",
      component: () => import("./views/WordView.vue"),
    },
    {
      path: "/practice",
      name: "practice",
      component: () => import("./views/PracticeView.vue"),
    },
    {
      // Lightweight pronunciation player opened from the bot's 🎧 button — no auth.
      path: "/youglish/:word",
      name: "youglish",
      component: () => import("./views/YouglishView.vue"),
      meta: { public: true },
    },
  ],
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const auth = useAuthStore();
  if (auth.token) return true;

  // Inside Telegram: authenticate silently with the injected initData.
  const initData = getTelegramWebApp()?.initData;
  if (initData) {
    try {
      await auth.loginWithInitData(initData);
      return true;
    } catch {
      // fall through to /login (e.g. non-owner account)
    }
  }
  return { name: "login", query: to.fullPath === "/dictionary" ? {} : { redirect: to.fullPath } };
});

export default router;
