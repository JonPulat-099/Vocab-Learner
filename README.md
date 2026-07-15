# Vocab Learner

English vocabulary learning system: a **Telegram bot** for searching and saving words, and a **website** for reviewing and practicing them.

A search hits three sources — **Merriam-Webster** (official API), **Cambridge Dictionary** (english-russian edition) and **YouGlish** — then **Gemini** merges everything into one sense-grouped card with English definitions, Russian translations, and examples.

```
📖 feeling (feelings) /ˈfiː.lɪŋ/ [noun] · B1

I. (EMOTION) emotion — чувство, эмоция
  1. guilty feelings
  2. a feeling of joy/sadness

II. (PHYSICAL) the way something feels physically — ощущение
  1. I had a tingling feeling in my fingers.
...
```

## Features

**Bot** (grammY)
- Search any word (plain message or `/search`) → AI-merged card
- 💾 Save to personal dictionary · 🎧 YouGlish pronunciation link
- 🗑 Clear history — deletes the search messages from the chat itself (Telegram allows deletion only for messages < 48h old)
- `/mywords`, `/history`, "did you mean" suggestions for typos

**Website** (Vue 3 + Tailwind + GSAP)
- Log in with Telegram (Login Widget) — same identity as the bot
- Saved words list with search/filter
- Word details: AI summary with EN+RU example pairs, raw Cambridge & Merriam-Webster entries, embedded YouGlish player
- Practice: pick words → flashcards (flip → ✅ know / ❌ don't know) → results screen with known / needs-work lists and retry

## Architecture

One Node.js process serves everything: grammY is mounted inside Fastify via `webhookCallback`, and the same service layer powers both the bot and the REST API for the website.

```
Telegram ──webhook──▶ Fastify ─┬─ grammY bot
                               ├─ /api/* (JWT, for the SPA)
                               └─ services: mw · cambridge · youglish · gemini
                                        │
                                        ▼
                                    Supabase
                                        ▲
                               Vue 3 SPA (Cloudflare Pages)
```

**Cache-first:** each word is fetched from the sources and summarized by Gemini exactly once, then served from the `words` table forever. This neutralizes the MW rate limit (1,000/day), Cambridge scraping fragility, and Gemini cost.

**Graceful degradation:** sources run in `Promise.allSettled` with timeouts; if Gemini fails, a raw card is built from MW + Cambridge directly. A search never fully fails because one dependency is down.

## Repo layout

```
apps/
  server/        # Fastify + grammY + services (one deploy unit)
  web/           # Vue 3 SPA
packages/
  shared/        # zod schemas + TS types (WordSummary etc.)
supabase/
  migrations/
docs/
  vocab-project-plan.md
TODO.md          # phased task list (Claude Code works through this)
CLAUDE.md        # project memory for Claude Code
```

## Setup

Prereqs: Node 22+, yarn, a Supabase project, and these keys:

| Key | Where |
|---|---|
| `BOT_TOKEN` | @BotFather |
| `MW_API_KEY` | dictionaryapi.com → Collegiate Dictionary (free, 1,000 req/day) |
| `GEMINI_API_KEY` | aistudio.google.com |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings |

```bash
yarn install

# env
cp apps/server/.env.example apps/server/.env   # fill in keys, set OWNER_TG_ID to your tg id
cp apps/web/.env.example apps/web/.env

# database
# apply supabase/migrations/*.sql to your project (Supabase SQL editor or CLI)

# run
yarn --filter server dev     # Fastify + bot in long-polling mode
yarn --filter web dev        # Vite on :5173
```

The bot runs in **long-polling** locally (`BOT_MODE=polling`) — no tunnel needed. `OWNER_TG_ID` makes the bot single-user: messages from anyone else are ignored.

## Testing

```bash
yarn -r test
```

Source parsers are tested against **saved fixtures** (`fixtures/*.html`, `fixtures/*.json`) — CI never makes live requests. If Cambridge changes its markup, re-save the fixture and update the single `SELECTORS` config in `cambridge.service.ts`.

## Deployment (free tier)

| Piece | Platform |
|---|---|
| server (bot + API) | **Koyeb** free — no sleep mode, so the bot answers instantly; TLS on `*.koyeb.app` satisfies Telegram's webhook requirement |
| web | **Cloudflare Pages** |
| database | **Supabase** free tier |

Flow: GitHub Actions builds the Docker image (Koyeb's free 0.1 vCPU is too slow to build) → Koyeb deploys it with `BOT_MODE=webhook` → webhook registered at `https://<app>.koyeb.app/webhook/<WEBHOOK_SECRET>`. The Pages domain must be set via BotFather's `/setdomain` for the Login Widget to work. See `TODO.md` Phase 7.

## Docs

- `docs/vocab-project-plan.md` — full plan: schema, source parsing details, card format, risks
- `TODO.md` — phased implementation checklist with per-task acceptance criteria
