import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router.js";
import { initTelegramApp } from "./lib/telegram.js";
import "./style.css";

initTelegramApp();

createApp(App).use(createPinia()).use(router).mount("#app");
