-- Migration 002: Full order lifecycle
-- Run AFTER schema.sql in Supabase Studio → SQL Editor
-- Adds: pre-auth tracking, subscription tracking, payments ledger, refund deadline

-- ─── orders: new columns ─────────────────────────────────────
alter table orders
  add column if not exists security_deposit_cents int not null default 0,
  add column if not exists stripe_auth_pi_id text,               -- 48h pre-auth PaymentIntent
  add column if not exists authorized_amount_cents int default 0, -- amount held in pre-auth
  add column if not exists stripe_subscription_id text,           -- Stripe Subscription (monthly rent)
  add column if not exists refund_deadline timestamptz,            -- delivery_date - 48h; no refunds after this
  add column if not exists subscription_ends_at timestamptz,      -- when subscription auto-cancels
  add column if not exists delivered_at timestamptz,
  add column if not exists delinquent_at timestamptz,
  add column if not exists return_date date,                      -- scheduled furniture pickup date
  add column if not exists return_completed_at timestamptz;

-- Update status flow comment
comment on column orders.status is
  'pending → deposit_paid → authorized → delivered → active → return_scheduled → completed
   branch: auth_failed (pre-auth failed, needs attention)
   branch: delinquent (subscription payment failed after retries)
   branch: refunded (cancelled before refund_deadline)
   branch: failed (initial deposit payment failed)

   User-facing mapping (9 steps):
     ① No order yet         = customer exists, no orders
     ② Checkout incomplete   = pending
     ③ Confirmed & scheduled = deposit_paid
     ④ Delivery within 48h   = authorized
     ⑤ Active rental         = active / delivered
     ⑥ Payment failed        = failed / auth_failed / delinquent
     ⑦ Term ending soon      = active + subscription_ends_at ≤ 30 days
     ⑧ Return scheduled      = return_scheduled
     ⑨ Plan completed        = completed';

-- Backfill refund_deadline for existing orders that have a delivery_date
update orders
  set refund_deadline = (delivery_date::timestamptz - interval '48 hours')
  where delivery_date is not null and refund_deadline is null;

-- Index for cron queries
create index if not exists orders_refund_deadline_idx on orders(refund_deadline);
create index if not exists orders_subscription_id_idx on orders(stripe_subscription_id);

-- ─── payments (ledger of every charge) ───────────────────────
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,

  -- what kind of payment
  type text not null,
  -- types:
  --   deposit          $25 initial
  --   pre_auth         48h hold (not yet captured)
  --   pre_auth_capture captured pre-auth (first month + security deposit - $25)
  --   buy_capture      captured pre-auth for buy orders (full price - $25)
  --   subscription     monthly rent via Stripe Subscription
  --   buyout           rent-to-own difference charge
  --   refund           $25 deposit refund

  amount_cents int not null,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  status text not null default 'succeeded',   -- succeeded | pending | failed | refunded
  description text,
  created_at timestamptz not null default now()
);

create index if not exists payments_order_id_idx on payments(order_id);
create index if not exists payments_type_idx on payments(type);
