-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Roomo Coupon Codes — Supabase SQL                         ║
-- ║  Run this in Supabase SQL Editor                           ║
-- ╚══════════════════════════════════════════════════════════════╝

-- 1) Coupons table
CREATE TABLE IF NOT EXISTS coupons (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code          text UNIQUE NOT NULL,                -- e.g. "ROOMONYC10", "BLDG-AVALON-15"
  discount_type text NOT NULL DEFAULT 'percentage',  -- 'percentage' or 'fixed'
  discount_value numeric NOT NULL,                   -- 10 = 10%  or  50 = $50 off
  description   text,                                -- "Newsletter welcome discount"
  partner       text,                                -- "newsletter", "avalon_building", "instagram"
  max_uses      integer,                             -- NULL = unlimited
  current_uses  integer DEFAULT 0,
  applies_to    text DEFAULT 'first_month',          -- 'first_month', 'all_months', 'buy_total'
  active        boolean DEFAULT true,
  starts_at     timestamptz DEFAULT now(),
  expires_at    timestamptz,                         -- NULL = never expires
  created_at    timestamptz DEFAULT now()
);

-- 2) Add coupon columns to existing orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_cents integer DEFAULT 0;

-- 3) Insert the first coupon: newsletter welcome 10% off
INSERT INTO coupons (code, discount_type, discount_value, description, partner, applies_to)
VALUES ('ROOMONYC10', 'percentage', 10, 'Newsletter welcome — 10% off first month', 'newsletter', 'first_month')
ON CONFLICT (code) DO NOTHING;
