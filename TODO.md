# TODO — Vocab Learner (bot + web)

> Task list for Claude Code. Work top-to-bottom; each task is atomic and has a "done when" check.
> Full context lives in `docs/vocab-project-plan.md` — read it before starting a phase.
> Stack: pnpm workspaces · TS · Fastify + grammY (one process, `apps/server`) · Vue 3 + Tailwind + GSAP (`apps/web`) · Supabase · Gemini structured output.
> Single user (guard by `OWNER_TG_ID`). Cache-first: a word is fetched from sources + summarized by Gemini once, forever.

---

## Phase 0 — Foundations

- [x] **0.1 Scaffold monorepo**
  pnpm workspaces: `apps/server`, `apps/web`, `packages/shared`. TS config base + per-package. ESLint + Prettier.
  *Done when:* `pnpm -r build` passes on empty packages.
- [x] **0.2 Env plumbing**
  Copy `server.env.example` / `web.env.example` into place; `apps/server/src/config.ts` parses env with zod, crashes on missing required vars.
  *Done when:* server starts with valid `.env`, exits with a clear message on a missing var.
- [x] **0.3 Supabase migrations**
  `supabase/migrations/0001_init.sql` with tables from plan §3: `words`, `users`, `search_history` (incl. `chat_id`, `query_message_id`, `result_message_id`), `user_words` (with dormant SM-2 columns), `practice_reviews` + indexes.
  *Done when:* migration applies cleanly on a fresh Supabase project.
- [x] **0.4 Shared types**
  `packages/shared`: zod schemas → `WordSummary` (sense-grouped: `senses[] { guideword, definition_en, translation_ru, examples[] {en, ru} }`), `PracticeReview`, API request/response types.
  *Done when:* both apps import types from `@vocab/shared`.

## Phase 1 — Source services (`apps/server/src/services/`)

- [x] **1.1 `mw.service.ts`** — Merriam-Webster Collegiate API
  Fetch, parse `fl`, `shortdef[]`, `vis` examples. Detect the "suggestions array" response (unknown word) → return `{ suggestions: string[] }`.
  *Done when:* unit tests pass against saved JSON fixtures (known word, unknown word, multi-POS word).
- [x] **1.2 `cambridge.service.ts`** — scraper for english-russian edition
  cheerio; ALL selectors in one exported `SELECTORS` config object. Extract per entry: POS, guideword (`dsense_gw`), EN def, RU translation, examples. Realistic UA/Accept-Language headers.
  *Done when:* tests pass against saved HTML fixtures (`feeling`, one single-sense word, one miss/404).
- [x] **1.3 `youglish.service.ts`** — Tier 1
  Interface `getYouglish(word)` returning `{ link }` now; leave a stubbed Tier 2 branch behind `YOUGLISH_API_KEY`.
  *Done when:* returns correct deep link `https://youglish.com/pron/{word}/english`.
- [x] **1.4 `words.repo.ts`** — cache layer
  `getOrFetchWord(word)`: normalize lowercase → lookup `words` → on miss run `Promise.allSettled([mw, cambridge, youglish])` with `SOURCE_TIMEOUT_MS`, store raw payloads.
  *Done when:* second call for the same word makes zero external requests (assert with mocked fetch).

## Phase 2 — Gemini + bot core

- [x] **2.1 `gemini.service.ts`**
  `@google/genai`, `GEMINI_MODEL`, `responseSchema` = `WordSummary`. Prompt: group into senses with one-word GUIDEWORD, merge MW+Cambridge, ≤3 examples/sense, RU translation for EVERY example (Cambridge's if present, else translate).
  *Done when:* returns schema-valid JSON for `feeling`; timeout → typed `GeminiUnavailable` error.
- [x] **2.2 Raw-card fallback**
  `buildRawSummary(mw, cambridge)` → `WordSummary` without Gemini (best-effort sense grouping from Cambridge structure).
  *Done when:* search still produces a card when Gemini throws.
- [x] **2.3 Bot skeleton** (`apps/server/src/bot/`)
  grammY inside Fastify via `webhookCallback(bot, "fastify")`; `BOT_MODE` switch (polling/webhook); `OWNER_TG_ID` guard middleware; `/start` upserts user.
  *Done when:* bot answers `/start` locally in polling mode, ignores other tg ids.
- [x] **2.4 Search flow**
  Plain text + `/search` → send "⏳" placeholder → `getOrFetchWord` → Gemini/fallback → edit placeholder with card. Store `chat_id` + both message ids in `search_history`.
  *Done when:* end-to-end search works in dev; `search_history` row contains both message ids.
- [x] **2.5 Card renderer** (`bot/format.ts`)
  HTML parse mode, format from plan §4: header `📖 word (forms) /IPA/ [pos] · CEFR`, Roman-numeral senses `(GUIDEWORD) def — RU`, numbered EN examples. Truncate at 4096 chars (~5 senses × 3 examples) → append "🌐 Full entry on site" URL button.
  *Done when:* snapshot test for `feeling` matches the target layout; long word truncates without breaking HTML tags.
- [x] **2.6 "Did you mean"**
  MW suggestions → inline buttons (max 6) that re-trigger search.
  *Done when:* typo `feelling` offers `feeling` button and it works.

## Phase 3 — Save & history

- [x] **3.1 Save button** — callback `save:{word_id}` → upsert `user_words` → edit keyboard to `✅ Saved`. Idempotent.
- [x] **3.2 `/mywords`** — paginated inline list (10/page), tap → re-render card from cache.
- [x] **3.3 `/history`** — last 10 searches, tap to re-open.
- [x] **3.4 Clear history (chat cleanup)**
  🗑 button + `/clear` → confirm prompt (mention 48h limit) → iterate `search_history`: `deleteMessage` for query + result ids, catch-and-continue on >48h errors, small delay between batches → delete rows.
  *Done when:* fresh messages disappear from chat; old ones are skipped without crashing; table is empty after.

## Phase 4 — REST API + web auth

- [x] **4.1 Fastify plugins** — `@fastify/jwt`, `@fastify/cors` (allow `WEB_ORIGIN`), zod route schemas from `@vocab/shared`.
- [x] **4.2 `POST /api/auth/telegram`** — verify Login Widget payload HMAC (bot token key), check `auth_date` freshness, match `tg_id` == `OWNER_TG_ID` → JWT. Plus `GET /api/me`. *(Also accepts Mini App `initData` — HMAC with `WebAppData` key — so the site works as a Telegram Web App; dev-only `POST /api/auth/dev` for localhost.)*
  *Done when:* forged payload → 401; valid payload → JWT that passes auth on other routes.
- [x] **4.3 Word routes** — `GET /api/words` (q filter), `GET /api/words/:id` (summary + all 3 raw payloads), `DELETE /api/words/:id` (unsave).
- [x] **4.4 History routes** — `GET /api/history`, `DELETE /api/history` (DB only; chat cleanup stays bot-side).
- [x] **4.5 Practice routes** — `POST /api/practice/queue` `{ word_ids?, limit }` → cards; `POST /api/practice/review` `{ user_word_id, grade (0|1), mode:'flashcard' }` → insert review, bump `reps`/`lapses`.

## Phase 5 — Website core (`apps/web`)

- [x] **5.1 Scaffold** — Vite + Vue 3 + `vue-router` + pinia + Tailwind; `useApi()` composable with JWT from localStorage; auth guard. *(Runs as a Telegram Mini App: telegram-web-app.js bridge, `--tg-theme-*` design tokens with browser fallbacks, native BackButton, initData auto-login in the guard.)*
- [x] **5.2 `/login`** — Telegram Login Widget (`VITE_TG_BOT_USERNAME`) → `POST /api/auth/telegram` → store JWT → redirect. *(Inside Telegram: silent initData login; localhost: dev sign-in button.)*
- [x] **5.3 `/dictionary`** — saved words grid: word, POS, first RU gloss, CEFR chip; search box + POS filter; multi-select mode → "Practice selected".
- [x] **5.4 `/word/:id`** — sections: AI Summary (sense-grouped, full EN+RU example pairs) · Cambridge raw · Merriam-Webster raw · YouGlish embedded widget (official JS widget, `VITE_YOUGLISH_LANG`).
- [x] **5.5 GSAP pass 1** — staggered grid entrance, FLIP on filter, ScrollTrigger reveals on word page.
- [x] **5.6 YouGlish Mini App** — lightweight `/youglish/:word` page (no auth) embedding the official YouGlish widget (reuse 5.4 embed; register a widget key). Bot: 🎧 button becomes `keyboard.webApp(...)` when `WEB_ORIGIN` is https (Telegram rejects non-https web_app URLs), else keep the current plain youglish.com URL button.
  *Done when:* in prod, tapping 🎧 opens the player inside Telegram; in dev (localhost), button still opens youglish.com; keyboard test covers both branches.

## Phase 6 — Practice

- [x] **6.1 Session store** (pinia) — build queue from selection or all saved, shuffle.
- [x] **6.2 Flashcard component** — front: word (+IPA); tap → GSAP 3D flip (`rotationY`, backface) → back: senses + RU; buttons `✅ I know` / `❌ Don't know`; swipe-out animation right/left on grade; progress bar with eased fill. *(CSS 3D flip + GSAP swipe-out per the design mock.)*
- [x] **6.3 Review persistence** — each grade → `POST /api/practice/review`; optimistic UI, retry on failure.
- [x] **6.4 Results screen** — Know / Needs-work stat tiles, needs-work chips, "Retry needs-work" seeds a new session. *(Simplified to the claude.ai/design mock: no confetti/count-up.)*
  *Done when:* full loop works: select → grade all → results → retry unknown.

## Phase 7 — Deploy (free tier)

- [x] **7.1 Dockerfile** for `apps/server` (multi-stage, node:22-slim, pnpm deploy --prod). *(`pnpm deploy --legacy` — pnpm ≥10 needs it without inject-workspace-packages; server ships `dist` only via `files` field.)*
- [x] **7.2 GitHub Actions** — build image on push to `main`, push to registry, trigger platform redeploy (build in CI, not on the host). *(`.github/workflows/deploy.yml`: test → GHCR push (`ghcr.io/<repo>/server`) → `railway redeploy --from-source`; deploy step skipped until the `RAILWAY_TOKEN` secret exists, service name via `RAILWAY_SERVICE` repo variable (default `server`). Switched from Koyeb to Railway 2026-07-17.)*
- [ ] **7.3 Railway service** — create a Railway project + service sourced from the Docker image `ghcr.io/jonpulat-099/vocab-learner/server:latest` (after the first CI push, set the GHCR package visibility to **public** so Railway can pull it). Set env vars, `BOT_MODE=webhook`, healthcheck path `/healthz` in service settings (Railway injects `PORT`); generate a domain. Add the `RAILWAY_TOKEN` **project token** secret (+ optional `RAILWAY_SERVICE` repo variable) in GitHub so the deploy step runs. Register webhook `https://<service>.up.railway.app/webhook/<WEBHOOK_SECRET>` with `secret_token`.
- [ ] **7.4 Railway web service** — point the `web` service source at the Docker image `ghcr.io/jonpulat-099/vocab-learner/web:latest` (built by CI from `apps/web/Dockerfile`; nginx serves the static bundle with SPA fallback, listens on injected `PORT`). Set GitHub repo **variables** `VITE_API_URL` (server domain), `VITE_TG_BOT_USERNAME`, `VITE_YOUGLISH_LANG` — they're baked into the bundle at image build, so changing them requires a rebuild, not a redeploy. Generate a domain; set the server's `WEB_ORIGIN` to it; BotFather `/setdomain` with that domain. Optional `RAILWAY_SERVICE_WEB` repo variable if the service isn't named `web`.
- [ ] **7.5 Smoke test prod** — search, save, clear (48h path), login on site, open word, run a practice session.

---

## Conventions for Claude Code

- Never log or echo secrets from `.env`.
- New selectors/URLs for Cambridge go ONLY in `SELECTORS` config — no inline selectors.
- Every service gets fixture-based tests (`vitest`); scrapers test against saved HTML in `fixtures/`, never live requests in CI.
- All bot user-facing strings live in `bot/texts.ts` (future i18n).
- Commit per task (`feat(phase2): 2.4 search flow`), keep tasks independent enough to review.
