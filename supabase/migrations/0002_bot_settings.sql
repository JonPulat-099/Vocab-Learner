-- Global, owner-controlled bot settings (currently just the active AI provider)

create table bot_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

insert into bot_settings (key, value) values ('active_model', 'gemini');
