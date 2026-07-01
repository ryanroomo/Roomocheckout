-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 003 — Building lease-promo coupons                 ║
-- ║  Run AFTER create-coupons-table.sql in Supabase SQL Editor    ║
-- ╚══════════════════════════════════════════════════════════════╝
--
-- Adds a reusable "building sticker" coupon mechanism:
--   • 12-month lease  → 1 free month (given at the END of the term,
--                       i.e. keep the furniture one extra month, no 13th charge)
--   • < 12-month lease → intro % off the first N months
--
-- Also:
--   • Fixes the "usage counted on failed orders" bug by moving usage
--     counting to a redemption ledger written only when a deposit is paid.
--   • Enforces one redemption per customer (per_customer_limit).
--   • Adds orders.bonus_free_months and orders.cancelled_at (the latter is
--     referenced by cancel-order.js / admin code and is added defensively).

-- ─── 1) coupons: promo rule columns ──────────────────────────
alter table coupons
  add column if not exists promo_type          text not null default 'simple',
  -- 'simple'         → legacy behavior (discount_type / discount_value / applies_to)
  -- 'building_lease' → conditional: free month(s) for long lease, else intro % off
  add column if not exists free_month_min_lease integer,               -- lease months ≥ this → bonus free months (e.g. 12)
  add column if not exists bonus_free_months    integer not null default 0,  -- free months at end (e.g. 1)
  add column if not exists intro_discount_pct   numeric,               -- % off when lease < threshold (e.g. 10)
  add column if not exists intro_discount_months integer not null default 0, -- number of first months the intro % applies (e.g. 3)
  add column if not exists per_customer_limit   integer;               -- NULL = no per-customer cap; 1 = once per customer

-- ─── 2) orders: bonus month + defensive cancelled_at ─────────
alter table orders
  add column if not exists bonus_free_months integer not null default 0,
  add column if not exists cancelled_at      timestamptz;

-- ─── 3) coupon_redemptions ledger ────────────────────────────
-- One row per (coupon, customer). Written only when a deposit is actually
-- paid (see stripe-webhook.js). The unique constraint makes usage counting
-- idempotent and enforces the per-customer limit.
create table if not exists coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references coupons(id)   on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  order_id    uuid references orders(id)             on delete set null,
  created_at  timestamptz not null default now(),
  unique (coupon_id, customer_id)
);
create index if not exists coupon_redemptions_coupon_idx   on coupon_redemptions(coupon_id);
create index if not exists coupon_redemptions_customer_idx on coupon_redemptions(customer_id);

-- ─── 4) First building sticker code: 1DSQFM ──────────────────
-- 12-month lease → 1 free month (at end). <12-month lease → 10% off first 3 months.
-- One use per customer.
insert into coupons (
  code, promo_type, discount_type, discount_value, applies_to,
  free_month_min_lease, bonus_free_months, intro_discount_pct, intro_discount_months,
  per_customer_limit, max_uses, description, partner
) values (
  '1DSQFM', 'building_lease', 'percentage', 0, 'first_month',
  12, 1, 10, 3,
  1, null, '12-mo lease: 1 free month · <12-mo: 10% off first 3 months', 'building_sticker'
) on conflict (code) do nothing;

-- ─── Adding another building later (template) ────────────────
-- Same mechanism, different code + partner. Uncomment and edit:
-- insert into coupons (
--   code, promo_type, discount_type, discount_value, applies_to,
--   free_month_min_lease, bonus_free_months, intro_discount_pct, intro_discount_months,
--   per_customer_limit, description, partner
-- ) values (
--   'AVALON7', 'building_lease', 'percentage', 0, 'first_month',
--   12, 1, 10, 3, 1, 'Avalon building sticker', 'building_avalon'
-- ) on conflict (code) do nothing;
