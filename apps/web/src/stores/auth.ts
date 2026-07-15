import { defineStore } from "pinia";
import { ref } from "vue";
import type { AuthResponse, MeResponse, TelegramLoginPayload } from "@vocab/shared";
import { clearToken, getToken, setToken, useApi } from "../lib/api.js";

export const useAuthStore = defineStore("auth", () => {
  const api = useApi();
  const token = ref<string | null>(getToken());
  const me = ref<MeResponse | null>(null);

  function accept(auth: AuthResponse): void {
    setToken(auth.token);
    token.value = auth.token;
  }

  /** Mini App path: silent login with the signed initData Telegram injected. */
  async function loginWithInitData(initData: string): Promise<void> {
    accept(await api.post<AuthResponse>("/api/auth/telegram", { initData }));
  }

  /** Browser path: payload from the Telegram Login Widget callback. */
  async function loginWithWidget(payload: TelegramLoginPayload): Promise<void> {
    accept(await api.post<AuthResponse>("/api/auth/telegram", payload));
  }

  /** Localhost only — the server exposes /api/auth/dev in development. */
  async function loginDev(): Promise<void> {
    accept(await api.post<AuthResponse>("/api/auth/dev"));
  }

  async function fetchMe(): Promise<void> {
    me.value = await api.get<MeResponse>("/api/me");
  }

  function logout(): void {
    clearToken();
    token.value = null;
    me.value = null;
  }

  return { token, me, loginWithInitData, loginWithWidget, loginDev, fetchMe, logout };
});
