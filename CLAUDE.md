# CLAUDE.md

Vocab Learner — Telegram bot + website for English vocabulary (EN/RU). Single user.

## What this is

Search a word → fetch Merriam-Webster (API) + Cambridge english-russian (scraper) + YouGlish (link) → Gemini merges into a sense-grouped `WordSummary` → bot card / website. Save words, practice with flashcards.

Read before large tasks: `docs/vocab-project-plan.md` (full spec), `TODO.md` (task list — work top-to-bottom, respect "done when" checks, tick boxes as you complete tasks).

## Commands

```bash
yarn install
yarn --filter server dev      # Fastify + bot, long-polling
yarn --filter web dev         # Vite :5173
yarn -r test                  # vitest, fixture-based
yarn -r build
yarn -r lint
```

## Architecture (invariants — do not change without asking)

- **One process.** grammY runs inside Fastify (`webhookCallback(bot, "fastify")`). Bot and REST API share `apps/server/src/services/`. Never split into separate deployables.
- **Cache-first.** `words` table caches raw source payloads + Gemini summary per word, forever (`WORD_CACHE_TTL_DAYS=0`). A word costs external calls exactly once. Never bypass `words.repo.getOrFetchWord()`.
- **Graceful degradation.** Sources run in `Promise.allSettled` with `SOURCE_TIMEOUT_MS`. Gemini failure → `buildRawSummary()` fallback. A search must never hard-fail because one source is down.
- **All DB access server-side** via `SUPABASE_SERVICE_ROLE_KEY`. The web app never imports supabase-js — it talks to `/api/*` with a JWT.
- **Single-user guard.** Bot middleware ignores any `tg_id !== OWNER_TG_ID`; `/api/auth/telegram` rejects other ids too.

## Data shape

`WordSummary` (zod, in `packages/shared`) is sense-grouped:
`{ word, forms[], part_of_speech, transcription, cefr_guess, senses[]: { guideword, definition_en, translation_ru, examples[]: { en, ru } }, usage_note }`
- Every example has BOTH `en` and `ru` (Cambridge's RU when present, else Gemini translates).
- Gemini is called with `responseSchema` = this schema. Never parse free-form model text.

## Bot card format (do not deviate)

```
📖 feeling (feelings) /ˈfiː.lɪŋ/ [noun] · B1

I. (EMOTION) emotion — чувство, эмоция
  1. guilty feelings
  2. a feeling of joy/sadness
```
- Roman numerals per sense; EN examples only on the card (RU pairs are website-only).
- HTML parse mode; hard cap 4096 chars → truncate at ~5 senses, add "🌐 Full entry on site" button. Never emit unclosed HTML tags when truncating.

## Gotchas

- **MW unknown word** returns an array of suggestion *strings*, not entry objects → render "did you mean" buttons.
- **Cambridge scraping:** selectors live ONLY in the exported `SELECTORS` object in `cambridge.service.ts`. No inline selectors anywhere. Send realistic `User-Agent` + `Accept-Language` headers.
- **Clear history deletes chat messages**, not just DB rows: iterate `search_history` (`chat_id`, `query_message_id`, `result_message_id`) → `deleteMessage` each → then delete rows. Telegram rejects deletes for messages >48h — catch per-message and continue, never abort the loop.
- **Search UX:** send "⏳" placeholder immediately, edit it in place with the card (pipeline takes 3–8s). Store both message ids in `search_history`.
- **Practice v1 is flashcards only:** grade 1 = know, 0 = don't know, `mode:'flashcard'`. SM-2 columns (`ease`, `interval_days`, `due_at`) exist in `user_words` but are intentionally unused — leave them alone.
- **Koyeb prod:** `BOT_MODE=webhook`, `PORT` injected by platform, image built in GitHub Actions (not on Koyeb). Health check: `GET /healthz`.

## Conventions

- TypeScript everywhere; zod schemas in `packages/shared` are the single source of truth for API + Gemini shapes.
- Tests: vitest, fixtures in `fixtures/` (saved HTML/JSON) — no live network calls in tests or CI.
- Bot user-facing strings in `apps/server/src/bot/texts.ts` only.
- Logging: pino; never log secrets, tokens, or full env.
- Commits per TODO task: `feat(phase2): 2.4 search flow`.
- When a task is ambiguous, prefer the plan doc over guessing; ask if the plan is silent.
