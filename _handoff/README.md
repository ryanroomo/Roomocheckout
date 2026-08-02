# Roomo Customer Portal — Frontend Handoff

This folder contains **only** the files touched by the recent frontend work, extracted from
the main repo so you don't have to diff a 618 MB tree.

## ⚠️ Before you start

**No backend, API, or database changes were made.** Nothing here should trigger edits to
`pages/api/`, `lib/`, `supabase/`, `framer/`, `package.json` or `next.config.js`. Those
directories were not touched and are deliberately not included in this folder.

## What's in here

| Path | What it is |
|---|---|
| `CHANGELOG-account-portal.md` | **Read this first.** Full description of every change, why it was made, verification results, and known TODOs. |
| `account.html.patch` | Unified diff of `public/account.html` against the last commit. Apply with `git apply account.html.patch` from the repo root if you'd rather review the delta than the whole file. |
| `public/account.html` | The complete updated file. Copy over `public/account.html` in the repo. |
| `public/preview.html` | New dev-only preview harness. Iframes `account.html?demo=true` with a status switcher and device-size presets. Optional — exclude from production if you prefer. |
| `public/images/hero-draped-bed.jpg` | New. Mobile hero background (1080×1620). |
| `public/images/hero-draped-bed-wide.jpg` | New. Desktop hero background (1600×900). |

Also deleted in the repo: `hero-mobile-preview.html` at the root — a scratch file from this
session, safe to remove.

Not included here (still in the main repo): `public/images/hero-draped-bed-source.png`, the
uncompressed original of the hero photo. Nothing references it; it's kept only as a source
asset.

## How to apply

Either replace the file wholesale:

```
cp public/account.html          <repo>/public/account.html
cp public/preview.html          <repo>/public/preview.html
cp public/images/hero-*.jpg     <repo>/public/images/
```

or apply the patch from the repo root:

```
git apply /path/to/_handoff/account.html.patch
```

## Data notes

Three optional fields were added to the frontend's expectations. **All three have
fallbacks and none is required today:**

- `BACKEND.billing.failedPaymentDateShort` — already derived inside `mapApiToBackend()`
  from the same source as `failedPaymentDate`, no API change needed.
- `BACKEND.plan.sets` — array of `'living' | 'dining' | 'bedroom'`, for multi-set orders.
  Falls back to the single `plan.setId`.
- `BACKEND.order.id` — used as the storage key for checklist progress. Falls back to
  `'demo'`.

The one item genuinely worth queueing: the new pre-delivery checklist stores its
completion state in `localStorage`, so it doesn't follow the customer across devices. If
that matters, a small record with `elevator` / `fit` / `submitted` booleans per order
would fix it. See §1 of the changelog.

## Unrelated observation

`public/account.html` is ~15.6 MB, of which **15.3 MB is 24 base64-inlined PNGs** of the
room sets. This predates the current work and was left alone. The same images already
exist as files under `public/images/`, so switching those `data:` URIs to `/images/...`
paths would cut the file by roughly 98% and let the browser cache them. Worth doing at
some point, but it's a separate change and shouldn't be bundled with this one.
