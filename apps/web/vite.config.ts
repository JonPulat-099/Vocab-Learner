import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    // Dev-only: let cloudflared quick tunnels reach the dev server (Telegram
    // web_app buttons require an https origin).
    allowedHosts: [".trycloudflare.com"],
  },
});
