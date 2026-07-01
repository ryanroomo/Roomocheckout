# Building-lease coupons + usage-bug fix

## What changed

**1. Bug fix — coupon usage no longer burned by failed checkouts.**
Usage used to increment the moment a PaymentIntent was created, so an abandoned
or failed checkout still consumed a code (and, for one-per-customer codes, burned
the customer's single use). Usage is now counted only when the $25 deposit is
actually paid, via a `coupon_redemptions` ledger. The webhook transition is
idempotent, which also fixes a latent double-confirmation-email bug.

**2. New reusable "building sticker" promo type (`promo_type = 'building_lease'`).**
One mechanism, one row per building. The first code is `1DSQFM`:

- **12-month lease → 1 free month** at the *end* of the term. The customer pays
  for 12 months (1st month at pre-auth capture + 11 subscription charges) and
  keeps the furniture through month 13 with no 13th charge. `subscription_ends_at`
  reflects month 13; billing (`cancel_at`) stops at month 12.
- **< 12-month lease → 10% off the first 3 months.** Month 1 is discounted at the
  48h pre-auth; months 2–3 are discounted via a repeating Stripe coupon on the
  subscription. Month 4+ are full price.
- **One use per customer** (`per_customer_limit = 1`).

## Files touched

- `supabase/migration-003-building-lease-coupons.sql` — **run this in Supabase SQL Editor.**
- `pages/api/create-payment-intent.js` — computes lease length, applies conditional
  discount / bonus month, per-customer check, no premature usage increment.
- `pages/api/stripe-webhook.js` — counts usage on paid deposit (idempotent).
- `pages/api/admin/capture.js` — subscription intro discount + end-of-lease free month.
- `pages/api/validate-coupon.js` — accepts `months`, returns correct preview text.
- `framer/RoomoCart.tsx` — sends `months`, shows the returned description.

## Deploy steps

1. Run `supabase/migration-003-building-lease-coupons.sql` in the Supabase SQL Editor
   (after `create-coupons-table.sql`).
2. Deploy the API changes to Vercel (push to the connected repo).
3. Paste the updated `framer/RoomoCart.tsx` into Framer.

## Adding another building later

Same mechanism, new code + partner — just one INSERT (template is at the bottom of
the migration file). Example:

```sql
insert into coupons (
  code, promo_type, discount_type, discount_value, applies_to,
  free_month_min_lease, bonus_free_months, intro_discount_pct, intro_discount_months,
  per_customer_limit, description, partner
) values (
  'AVALON7', 'building_lease', 'percentage', 0, 'first_month',
  12, 1, 10, 3, 1, 'Avalon building sticker', 'building_avalon'
) on conflict (code) do nothing;
```

Tune per building via `free_month_min_lease`, `bonus_free_months`,
`intro_discount_pct`, `intro_discount_months`.
