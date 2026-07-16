import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router.js";
import { initTelegramApp } from "./lib/telegram.js";
import { initTheme } from "./composables/useTheme.js";
import "./style.css";

initTelegramApp();
initTheme();

createApp(App).use(createPinia()).use(router).mount("#app");
