/**
 * Thin typed access to the Telegram Mini App bridge (telegram-web-app.js,
 * loaded in index.html). Every helper is a no-op in a plain browser so the
 * same code paths run inside and outside Telegram.
 */

interface TelegramBackButton {
  isVisible: boolean;
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

export interface TelegramWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  BackButton: TelegramBackButton;
  ready(): void;
  expand(): void;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

/** True when actually launched inside Telegram (not just the script being loaded). */
export function isInsideTelegram(): boolean {
  return Boolean(getTelegramWebApp()?.initData);
}

/** Call once at startup: tells Telegram the app is ready and takes full height. */
export function initTelegramApp(): void {
  const tg = getTelegramWebApp();
  if (!tg) return;
  tg.ready();
  tg.expand();
}

export function showBackButton(onBack: () => void): void {
  const tg = getTelegramWebApp();
  if (!tg?.initData) return;
  tg.BackButton.onClick(onBack);
  tg.BackButton.show();
}

export function hideBackButton(onBack: () => void): void {
  const tg = getTelegramWebApp();
  if (!tg?.initData) return;
  tg.BackButton.offClick(onBack);
  tg.BackButton.hide();
}
