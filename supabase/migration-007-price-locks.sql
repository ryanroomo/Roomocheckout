-- Migration 007: Price locks
-- Run in Supabase Studio → SQL Editor → New query → paste → Run
--
-- Leads captured at the ZIP step of the cart: people moving to NYC who
-- don't have their ZIP code yet. We lock today's pricing for 30 days
-- (price only — never inventory) and keep their email + expected move
-- month for follow-up.

create table if not exists price_locks (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  move_month text,                  -- "2026-09" (optional, from the dropdown)
  source text,                      -- where they signed up, e.g. 'zip_step'
  locked_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists price_locks_locked_until_idx on price_locks(locked_until);

drop trigger if exists price_locks_updated_at on price_locks;
create trigger price_locks_updated_at
  before update on price_locks
  for each row execute function set_updated_at();
