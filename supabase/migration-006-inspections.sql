-- Migration 006: Virtual inspections
-- Run in Supabase Studio → SQL Editor → New query → paste → Run
--
-- One row per order. Workers upload one overview photo + one 7s
-- walkthrough video per furniture set (stored in the private
-- "inspections" storage bucket); the customer then reviews the media
-- and signs. All access goes through signed HMAC links + the
-- service-role API, so the bucket stays private.

-- ─── inspections ─────────────────────────────────────────────
create table if not exists inspections (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,

  -- pending   → worker link created, nothing submitted yet
  -- submitted → worker finished all sets (media paths in `media`)
  -- confirmed → customer reviewed and signed
  status text not null default 'pending',

  -- { "living": { "photo": "<storage path>", "video": "<storage path>" }, ... }
  media jsonb not null default '{}'::jsonb,

  submitted_at timestamptz,        -- worker finished
  email_sent_at timestamptz,       -- inspection email sent to customer
  confirmed_at timestamptz,        -- customer signed
  confirmed_name text,             -- printed name typed at signing
  signature_path text,             -- storage path of the signature PNG
  confirm_user_agent text,         -- device info recorded as proof of receipt

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspections_order_id_idx on inspections(order_id);
create index if not exists inspections_status_idx on inspections(status);

drop trigger if exists inspections_updated_at on inspections;
create trigger inspections_updated_at
  before update on inspections
  for each row execute function set_updated_at();

-- ─── storage bucket (private) ────────────────────────────────
-- Media is uploaded via short-lived signed upload URLs and read via
-- signed download URLs, both minted server-side with the service role,
-- so no public access and no storage RLS policies are needed.
insert into storage.buckets (id, name, public)
values ('inspections', 'inspections', false)
on conflict (id) do nothing;
