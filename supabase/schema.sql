-- Roomo checkout schema
-- Run this in Supabase Studio → SQL Editor → New query → paste → Run

-- ─── customers ───────────────────────────────────────────────
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  phone text,
  stripe_customer_id text unique,
  created_at timestamptz not null default now()
);

-- ─── orders ──────────────────────────────────────────────────
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),

  -- delivery
  delivery_address text not null,
  delivery_city text not null,
  delivery_state text not null,
  delivery_zip text not null,
  delivery_date date,
  delivery_slot text,
  delivery_fee_cents int not null default 0,

  -- amounts (all in cents)
  deposit_cents int not null default 2500,            -- charged stage 1 (Stripe iframe)
  rental_monthly_cents int not null default 0,        -- sum of mode:rent items / mo
  buy_total_cents int not null default 0,             -- sum of mode:buy-new items (one-time)

  -- stripe
  stripe_payment_intent_id text unique,
  stripe_payment_method_id text,                      -- saved for stage 2 & 3 off_session charges

  -- status flow:
  --   pending          → PaymentIntent created, awaiting customer payment
  --   deposit_paid     → $25 deposit captured (webhook confirmed)
  --   balance_charged  → 48h pre-delivery charge succeeded
  --   delivered        → goods delivered
  --   refunded         → cancelled before delivery, deposit returned
  --   failed           → payment failed
  status text not null default 'pending',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── order_items ─────────────────────────────────────────────
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  set_type text not null,             -- living | dining | bedding
  mode text not null,                 -- rent | buy-new
  palette text,
  months int not null default 0,
  price_cents int not null,           -- /mo for rent, total for buy-new
  excluded text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ─── indexes ─────────────────────────────────────────────────
create index if not exists orders_customer_id_idx on orders(customer_id);
create index if not exists orders_pi_idx on orders(stripe_payment_intent_id);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_delivery_date_idx on orders(delivery_date);
create index if not exists order_items_order_id_idx on order_items(order_id);

-- ─── trigger: auto-update updated_at ─────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_updated_at on orders;
create trigger orders_updated_at
  before update on orders
  for each row execute function set_updated_at();
