-- Exostan case library. Written only by the edge function (service role).
create table if not exists public.exostan_cases (
  code text primary key,
  body jsonb not null,
  outcome jsonb,
  outcome_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.exostan_cases enable row level security;
-- No policies on purpose: no direct client access. All reads and writes go through the edge function.

-- Page chunks, so the edge function can serve the app without a redeploy.
create table if not exists public.exostan_assets (
  name text not null,
  seq int not null,
  content text not null,
  updated_at timestamptz not null default now(),
  primary key (name, seq)
);
alter table public.exostan_assets enable row level security;
