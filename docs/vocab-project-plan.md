# Vocab Learner — Full Project Plan

Telegram bot + website for English vocabulary learning with EN/RU definitions, AI summarization, personal dictionary, and practice mode.

**Stack:** grammY (bot) · Fastify (API) · Vue 3 + Tailwind + GSAP (web) · Supabase (Postgres + Auth-adjacent) · Gemini (summarization)

---

## 1. Architecture Overview

```
                         ┌────────────────────────────────────────┐
                         │            Node.js service             │
 Telegram ── webhook ──▶ │  Fastify                               │
                         │   ├─ grammY (mounted via webhookCallback)
                         │   ├─ /api/*  (REST for the website)    │
                         │   └─ services/                         │
                         │       ├─ mw.service        (MW API)    │
                         │       ├─ cambridge.service (scraper)   │
                         │       ├─ youglish.service  (API/links) │
                         │       └─ gemini.service    (summary)   │
                         └───────┬────────────────────────────────┘
                                 │ supabase-js (service role)
                                 ▼
                            Supabase (Postgres)
                                 ▲
                                 │ REST via Fastify (JWT)
                         Vue 3 SPA (Vite, Tailwind, GSAP)
```

**Key decision — one process, not three.** grammY runs *inside* Fastify via `webhookCallback(bot, "fastify")`. One deploy unit on the VDS, one Docker Compose service, shared service layer between bot and website API. The Vue SPA is a static build served by Fastify (or nginx) at `/`.

**Data flow for a search:**
1. User sends a word to the bot (plain text or `/search <word>`).
2. API checks the `words` cache table. Cache hit (< 30 days old) → skip to step 5.
3. `Promise.allSettled([mw, cambridge, youglish])` with per-source timeout (5s). Partial failure is OK — proceed with whatever returned.
4. Gemini merges everything into a structured JSON summary; raw payloads + summary are cached in `words`.
5. Row inserted into `search_history`; bot renders the summary card with inline buttons **💾 Save** / **🎧 YouGlish** / **🗑 Clear history**.

---

## 2. Data Sources

### 2.1 Merriam-Webster — official API ✅
- Register at `dictionaryapi.com` → free Collegiate Dictionary key, 1,000 req/day.
- `GET https://dictionaryapi.com/api/v3/references/collegiate/json/{word}?key=KEY`
- Extract: `fl` (part of speech), `shortdef[]` (EN meanings), example sentences from `def[].sseq` → `dt` entries of type `vis`.
- Edge case: unknown word returns an array of *suggestion strings* instead of objects — detect this and surface "Did you mean…" buttons in the bot.

### 2.2 Cambridge — no official API, scrape + cache ⚠️
- Target: `https://dictionary.cambridge.org/dictionary/english-russian/{word}` — this bilingual edition gives everything in one page: POS, EN definition, **RU translation**, examples.
- Implementation: `fetch` with realistic `User-Agent`/`Accept-Language` headers + `cheerio`. Selectors (verify at build time, they're stable but not guaranteed):
  - entry block: `.pr.entry-body__el`
  - POS: `.pos.dpos`
  - EN definition: `.def.ddef_d`
  - RU translation: `.trans.dtrans`
  - examples: `.examp .eg`
- **Mitigations for fragility:** aggressive caching in `words` (a word never changes — cache effectively forever, refresh only on demand); low request rate (personal use, not a crawler); isolate selectors in one config object so a markup change is a 5-minute fix; treat scraper failure as a soft failure (summary still built from MW).

### 2.3 YouGlish — widget on web, links/API in bot
- **Website:** official JS Widget API — embed the player on the word details page. Free, supported, ideal for "pronunciation in context."
- **Bot:** Telegram can't embed the widget. Two tiers:
  - **Tier 1 (day one):** deep link `https://youglish.com/pron/{word}/english` in an inline button. Zero risk.
  - **Tier 2 (optional):** apply for a YouGlish API access key (`youglish.com/api`) → fetch top N caption snippets + video links, show them as a list in the bot. Design `youglish.service` with both backends behind one interface so Tier 2 slots in later.

### 2.4 Gemini — summarization
- SDK: `@google/genai`, model `gemini-2.5-flash` (fast + cheap; keep model name in env).
- Use **structured output** (`responseSchema`) so parsing never breaks. The structure is **sense-grouped** (Cambridge-style guidewords), which maps directly to Cambridge's `dsense_gw` elements:

```json
{
  "word": "feeling",
  "forms": ["feelings"],
  "part_of_speech": "noun",
  "transcription": "/ˈfiː.lɪŋ/",
  "cefr_guess": "B1",
  "senses": [
    {
      "guideword": "EMOTION",
      "definition_en": "emotion",
      "translation_ru": "чувство, эмоция",
      "examples": [
        { "en": "guilty feelings", "ru": "чувство вины" },
        { "en": "a feeling of joy/sadness", "ru": "чувство радости/грусти" },
        { "en": "Her performance was completely lacking in feeling.", "ru": "В её исполнении совершенно не было чувства." }
      ]
    },
    {
      "guideword": "PHYSICAL",
      "definition_en": "the way something feels physically",
      "translation_ru": "ощущение, чувствительность",
      "examples": [
        { "en": "I had a tingling feeling in my fingers.", "ru": "У меня покалывало в пальцах." }
      ]
    }
  ],
  "usage_note": "common collocations, register"
}
```

- Prompt inputs: raw MW JSON + parsed Cambridge data. Instructions: group meanings into senses with a one-word GUIDEWORD each; merge/deduplicate MW+Cambridge definitions per sense; ≤3 examples per sense; **every example gets a RU translation** — use Cambridge's when available, otherwise Gemini translates (Q2 decision: always both languages).
- Bot renders EN examples only (compact card, per the target format); the website shows full EN+RU pairs.
- Fallback: if Gemini fails/times out, the bot returns a "raw" card built directly from MW + Cambridge — search must never fully fail because of the AI step.

---

## 3. Database Schema (Supabase)

```sql
-- global cache: one row per word, shared by all users
create table words (
  id            uuid primary key default gen_random_uuid(),
  word          text not null unique,           -- normalized lowercase
  mw_data       jsonb,
  cambridge_data jsonb,
  youglish_data jsonb,
  summary       jsonb,                          -- Gemini structured output
  fetched_at    timestamptz not null default now()
);

create table users (
  id           uuid primary key default gen_random_uuid(),
  tg_id        bigint not null unique,
  tg_username  text,
  first_name   text,
  created_at   timestamptz not null default now()
);

create table search_history (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references users(id) on delete cascade,
  word_id           uuid not null references words(id),
  chat_id           bigint,                        -- for chat cleanup
  query_message_id  bigint,                        -- user's message
  result_message_id bigint,                        -- bot's card
  created_at        timestamptz not null default now()
);

-- personal dictionary + SRS state in one table
create table user_words (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  word_id      uuid not null references words(id),
  saved_at     timestamptz not null default now(),
  -- lightweight SM-2:
  ease         real not null default 2.5,
  interval_days int  not null default 0,
  due_at       timestamptz not null default now(),
  reps         int  not null default 0,
  lapses       int  not null default 0,
  unique (user_id, word_id)
);

create table practice_reviews (
  id           bigint generated always as identity primary key,
  user_word_id uuid not null references user_words(id) on delete cascade,
  grade        smallint not null,               -- 0=again 1=hard 2=good 3=easy
  mode         text not null,                   -- flashcard | quiz_en_ru | quiz_ru_en | listening
  reviewed_at  timestamptz not null default now()
);

create index on user_words (user_id, due_at);
create index on search_history (user_id, created_at desc);
```

- Access model: **all DB access goes through Fastify with the service-role key**; RLS off (or belt-and-suspenders RLS keyed by a custom claim). The website never talks to Supabase directly — simpler, one auth story.
- "Clear history" = `delete from search_history where user_id = $1`.

---

## 4. Telegram Bot (grammY)

### Commands & flows
| Trigger | Behavior |
|---|---|
| `/start` | Register user (upsert by `tg_id`), short help, link to website |
| plain text / `/search w` | Full search pipeline → summary card |
| `/mywords` | Paginated list of saved words (inline pagination) |
| `/history` | Last 10 searches, tap to re-open |
| `/clear` | Confirm → wipe search history |
| `/site` | Login link to website (see §6 Auth) |

### Summary card format (HTML parse mode)
```
📖 feeling (feelings) /ˈfiː.lɪŋ/ [noun] · B1

I. (EMOTION) emotion — чувство, эмоция
  1. guilty feelings
  2. a feeling of joy/sadness
  3. Her performance was completely lacking in feeling.

II. (PHYSICAL) the way something feels physically — ощущение, чувствительность
  1. I had a tingling feeling in my fingers.
  2. Pablo lost all feeling in his feet.

III. (OPINION) an opinion or belief — мнение
  1. My feeling is that we should wait until they come back.

💡 strong feelings about · hurt sb's feelings
```
- Roman numerals per sense, `(GUIDEWORD) short EN definition — RU translation` header line, numbered EN examples below. RU example translations live in the data but stay off the bot card to keep it scannable — full EN+RU on the website.
- Telegram hard limit is 4096 chars: cap the card at ~5 senses × 3 examples; if truncated, add a "🌐 Full entry on site" button.
- Inline keyboard: `[💾 Save] [🎧 YouGlish] [🗑 Clear history]`
- Save button: callback `save:{word_id}` → upsert into `user_words` → edit message, button becomes `✅ Saved`.
- Show a "⏳ searching…" placeholder message and edit it in place when results arrive (pipeline takes 3–8s with Gemini).

### Clear history = clean the chat
"Clear history" physically deletes the search messages from the Telegram chat (both the user's query message and the bot's result card), not just DB rows:
- Store `chat_id`, `query_message_id`, `result_message_id` on every search in `search_history`.
- 🗑 button / `/clear` → iterate stored ids → `api.deleteMessage()` for each → then wipe the `search_history` rows.
- **Telegram constraint:** bots can only delete messages younger than **48 hours**. Older messages silently stay in chat (catch the error per message); DB rows are removed regardless. Mention this in the confirm prompt.
- Delete in small batches with a tiny delay to respect rate limits.

### Bot runtime
- Long-polling in dev; **webhook** in prod — mandatory on Koyeb (free TLS on `*.koyeb.app` satisfies Telegram's HTTPS requirement). Set a secret token on the webhook path.

---

## 5. Fastify API

```
POST /api/search            { word }            → summary (used by web search too)
GET  /api/words             ?q=&page=           → user's saved words
GET  /api/words/:id                             → full details (3 raw sources + summary)
DELETE /api/words/:id                           → unsave
GET  /api/history           /  DELETE /api/history
POST /api/practice/queue    { word_ids? , limit } → due cards (or picked words)
POST /api/practice/review   { user_word_id, grade, mode } → next due date (SM-2)
POST /api/auth/telegram     { Telegram Login payload } → JWT
GET  /api/me
```

- Plugins: `@fastify/jwt`, `@fastify/cors`, `@fastify/rate-limit`, `zod` (or `typebox`) schemas shared with the frontend via `packages/shared`.
- The bot calls the same `searchWord()` service function directly (same process), not over HTTP.

---

## 6. Website (Vue 3 + Tailwind + GSAP)

### Auth — linking Telegram identity to the browser
Use the **Telegram Login Widget**: user clicks "Log in with Telegram" on the site → Telegram returns a signed payload → Fastify verifies the HMAC (bot token as key) → finds/creates the same `users` row by `tg_id` → issues a JWT. One identity across bot and web, no passwords, no separate Supabase Auth needed.
Fallback/bonus: `/site` in the bot sends a one-time magic link (signed token, 5 min TTL) for devices where the widget is awkward.

### Pages
| Route | Content |
|---|---|
| `/login` | Telegram widget, hero animation |
| `/dictionary` | Saved words grid/list: word, POS, RU gloss, CEFR chip, due-for-review badge; search + filter by POS; multi-select for practice |
| `/word/:id` | Tabs/sections: **AI Summary** · **Cambridge** (POS, EN+RU defs, examples) · **Merriam-Webster** (defs, examples) · **YouGlish** (embedded widget playing the word in real videos) |
| `/practice` | Pick words (multi-select or "all saved") → flashcard session |
| `/practice/session` | **v1 flashcards:** card shows the word → tap to flip → sense definitions + RU → self-grade **✅ I know / ❌ Don't know** |
| `/practice/results` | Session summary: score, two lists — **Known** and **Needs work** — with one-tap "practice unknown again" |

Practice v1 flow:
1. User picks N words on `/practice` (checkbox grid) or hits "Practice all".
2. Cards are shuffled; each flip + grade writes a `practice_reviews` row (`grade`: 1 = know, 0 = don't know, `mode: 'flashcard'`).
3. Results screen groups the session into known / unknown; unknown list feeds a "retry these" button.
4. `user_words` keeps simple counters (`reps`, `lapses`) — the SM-2 columns stay in the schema unused for now, so spaced repetition can be turned on later without a migration.

### GSAP moments (purposeful, not decorative)
- 3D card flip on flashcards (`rotationY` + backface); swipe-right (know) / swipe-left (don't know) fling-out animation on grade.
- Staggered entrance of the word grid (`gsap.stagger`), FLIP transitions when filtering.
- Session progress bar with eased fill; results screen: score count-up, known/unknown lists cascade in, confetti burst on high scores.
- Word details: sections reveal on scroll (`ScrollTrigger`).

### Frontend stack details
- Vite + `vue-router` + `pinia`; API client with the JWT in a composable; Tailwind for layout, GSAP only for motion.

---

## 7. Repo Structure

```
vocab/
├─ apps/
│  ├─ server/            # Fastify + grammY (one process)
│  │  ├─ src/bot/        # handlers, keyboards, formatting
│  │  ├─ src/routes/     # REST
│  │  ├─ src/services/   # mw, cambridge, youglish, gemini, search, srs
│  │  └─ src/db/         # supabase client, queries
│  └─ web/               # Vue 3
├─ packages/shared/      # zod schemas, TS types (WordSummary, etc.)
├─ supabase/migrations/
└─ .env.example          # BOT_TOKEN, MW_KEY, GEMINI_KEY, SUPABASE_URL/KEY, JWT_SECRET
```

yarn workspaces; TypeScript everywhere.

---

## 7.5 Hosting — free tier plan (as of mid-2026)

| Piece | Where | Why |
|---|---|---|
| Fastify + grammY (one service) | **Koyeb free** (1 web service, 512 MB RAM, 0.1 vCPU) | **No sleep mode** — the container runs continuously, so the bot answers instantly. Usually no credit card. Webhook-friendly, auto-HTTPS on `*.koyeb.app` (Telegram webhooks require valid TLS — free tier gives it out of the box). |
| Vue 3 static build | **Cloudflare Pages** (or Vercel/Netlify) | Free static hosting, global CDN, custom domain, zero limits that matter here. |
| Database | **Supabase free tier** | Already the plan; 500 MB Postgres is far beyond a personal dictionary. |
| Gemini | **Google AI free tier** | Flash free quota is plenty at cache-first, one-call-per-word-ever usage. |

**Why not the alternatives:**
- **Render free** — web services spin down after inactivity; first request takes ~1 minute to wake. For a bot that's a dead-feeling UX (your message sits unanswered while it cold-starts). Fine as backup only.
- **Railway** — free plan is $1 credit/month now, not enough to keep a service online 24/7.
- **Fly.io** — no free tier for new accounts anymore.
- **Oracle Cloud Always Free** — the "real server" option (Ampere ARM, up to 4 OCPU / 24 GB RAM, run full Docker Compose). Best free deal on the internet *if* signup works — it requires a credit/debit card for identity verification, which can be a hurdle from Uzbekistan. Worth one attempt; if it goes through, it replaces Koyeb and removes all resource constraints.

**Deployment adjustments for Koyeb:**
- Single Dockerfile (or buildpack) for `apps/server`; web is deployed separately to Pages, so drop nginx from the picture — Fastify only serves the API + webhook.
- CORS: allow the Pages domain in `@fastify/cors`.
- Webhook is mandatory (not optional): `https://<app>.koyeb.app/webhook/<secret>`.
- 0.1 vCPU is slow for builds — build the Docker image in GitHub Actions and deploy the image, rather than building on Koyeb.
- Keep memory in check: cheerio parsing + Gemini SDK fit comfortably in 512 MB for single-user load.

**Upgrade path when free stops being enough:** Koyeb Eco (~$1.6/mo) or your existing VDS with the original Docker Compose setup — nothing in the architecture changes.

---

## 8. Milestones

**Phase 0 — Foundations (0.5 day)**
Repo scaffold, Supabase project + migrations, MW & Gemini keys, bot token, `.env`.

**Phase 1 — Source services (1–2 days)**
`mw.service`, `cambridge.service` (+ selector config, fixture-based tests with saved HTML), `youglish.service` (Tier 1 links), `words` caching layer.

**Phase 2 — Bot core (1–2 days)**
`/start`, search flow with placeholder-edit, Gemini summary card, error/fallback paths, "did you mean" suggestions.

**Phase 3 — Save & history (0.5–1 day)**
Save button + `user_words`, `/mywords`, `/history`, `/clear` with confirm + chat message deletion (48h-aware).

**Phase 4 — API + Web auth (1 day)**
JWT auth via Telegram Login Widget, `/api/words`, `/api/words/:id`, `/api/history`.

**Phase 5 — Website core (2–3 days)**
Dictionary list, word details with three source sections + YouGlish widget embed.

**Phase 6 — Practice (1–2 days)**
Flashcard picker → flip/grade session → results screen (known / needs-work), GSAP polish.

**Phase 7 — Deploy (0.5 day)**
Koyeb service (GitHub Actions image build), Cloudflare Pages for web, webhook + secret, pino logging.

Total: ~1.5–2 weeks part-time.

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Cambridge markup change / blocking | RU translations disappear | Forever-cache; selector config in one file; soft-fail → Gemini can still translate MW content to RU as fallback |
| YouGlish has no public REST for bot | No clip list in Telegram | Deep links day one; widget on web covers the real use case; apply for API key in parallel |
| Gemini latency/quota | Slow or failed cards | Placeholder-edit UX; raw-card fallback; cache means each word costs one Gemini call ever |
| MW 1,000 req/day | Hard cap | Cache-first pipeline makes this a non-issue for single-user use |
| Telegram 48h delete limit | Old search messages can't be wiped from chat | Communicate in confirm prompt; DB history still cleared |
| Koyeb free = 1 service | Can't split bot/API into separate containers | Architecture already runs them as one process — non-issue |
| Telegram Login Widget requires domain set via BotFather | Auth setup friction | `/setdomain` with the Pages domain during Phase 4; magic-link fallback |

---

## 10. Decisions (locked)

1. **Single user** — skip pagination polish, rate limiting, and RLS complexity; schema stays multi-user-shaped so nothing blocks opening it up later.
2. **RU everywhere** — every example carries a RU translation (Cambridge's when present, Gemini otherwise); bot card shows EN examples for compactness, website shows both.
3. **Practice v1 = flashcards only** — flip → ✅ know / ❌ don't know → results screen with known/unknown lists and retry. SM-2 columns dormant until needed.
4. **Free hosting** — Koyeb (server) + Cloudflare Pages (web) + Supabase free + Gemini free; Oracle Cloud Always Free as the stretch option.
5. **Clear history = clean the chat** — delete query + result messages via Bot API (≤48h), then purge DB rows.
