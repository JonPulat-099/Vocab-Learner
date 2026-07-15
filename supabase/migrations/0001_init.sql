-- Vocab Learner — initial schema (plan §3)

-- global cache: one row per word, shared by all users
create table words (
  id             uuid primary key default gen_random_uuid(),
  word           text not null unique,           -- normalized lowercase
  mw_data        jsonb,
  cambridge_data jsonb,
  youglish_data  jsonb,
  summary        jsonb,                          -- Gemini structured output
  fetched_at     timestamptz not null default now()
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
  chat_id           bigint,                      -- for chat cleanup
  query_message_id  bigint,                      -- user's message
  result_message_id bigint,                      -- bot's card
  created_at        timestamptz not null default now()
);

-- personal dictionary + SRS state in one table
-- SM-2 columns (ease, interval_days, due_at) are intentionally dormant in v1
create table user_words (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  word_id       uuid not null references words(id),
  saved_at      timestamptz not null default now(),
  ease          real not null default 2.5,
  interval_days int  not null default 0,
  due_at        timestamptz not null default now(),
  reps          int  not null default 0,
  lapses        int  not null default 0,
  unique (user_id, word_id)
);

create table practice_reviews (
  id           bigint generated always as identity primary key,
  user_word_id uuid not null references user_words(id) on delete cascade,
  grade        smallint not null,                -- 0=again 1=hard 2=good 3=easy
  mode         text not null,                    -- flashcard | quiz_en_ru | quiz_ru_en | listening
  reviewed_at  timestamptz not null default now()
);

create index on user_words (user_id, due_at);
create index on search_history (user_id, created_at desc);
