# Customer Portal — Frontend Changelog

**Scope:** `public/account.html` only (plus two new image assets and one dev-only preview page).
**Date:** 2026-08-02
**Branch state:** uncommitted working changes, +554 / −97 lines in `public/account.html`.

---

## ⚠️ Read this first (for the backend side)

**No backend, API, or database changes were made in this work.** Everything below is
presentation-layer. Please do not let this changelog trigger schema or endpoint edits.

Files touched:

| File | Status | Notes |
|---|---|---|
| `public/account.html` | modified | all UI work lives here |
| `public/images/hero-draped-bed.jpg` | new | mobile hero background (1080×1620) |
| `public/images/hero-draped-bed-wide.jpg` | new | desktop hero background (1600×900) |
| `public/images/hero-draped-bed-source.png` | new | original uncompressed source, not referenced by code |
| `public/preview.html` | new | **dev tool only**, safe to exclude from production |
| `hero-mobile-preview.html` (repo root) | deleted | scratch file from this session |

Files **not** touched: everything under `pages/`, `lib/`, `supabase/`, `framer/`, all API
routes, `package.json`, `next.config.js`.

---

## 1. New data the frontend reads (optional, all have fallbacks)

These are the only places where backend involvement would help later. **Nothing is
required right now** — every one of them degrades gracefully today.

| Field | Where | Current behaviour without it |
|---|---|---|
| `BACKEND.billing.failedPaymentDateShort` | Billing table | falls back to `failedPaymentDate` |
| `BACKEND.plan.sets` (array of `'living' \| 'dining' \| 'bedroom'`) | pre-delivery checklist | falls back to the single `plan.setId` |
| `BACKEND.order.id` | checklist progress storage key | falls back to the string `'demo'` |

`mapApiToBackend()` already populates `failedPaymentDateShort` from the same source as
`failedPaymentDate` — no API change needed for that one.

**Checklist completion state is currently stored in `localStorage`**, keyed by order id.
If you want it to persist per-customer across devices, that is the one genuine backend
task worth queuing: a small `order_prep_checklist` record with `elevator`, `fit`,
`submitted` booleans. Not urgent; the UI works without it.

---

## 2. State 3 / State 4 — flow change

The primary action changed from **Reschedule** to **Confirm**.

- Hero CTA for state 3 is now `Confirm Details` (was two equal buttons: Reschedule +
  Change Address).
- It opens the existing `confirmDeliveryModal`, which previously only served state 4.
  The modal now adapts its copy and button label by status:
  - state 3 → "Check that the date, time window, and address below are right…" / `Looks Right`
  - state 4 → original imminent-delivery copy / `Confirm Delivery`
- Reschedule and Change address moved **inside** that modal as secondary text links
  (`cdReschedule()`, new `cdChangeAddress()`).
- Delivery tab card follows the same hierarchy: `Confirm Details` primary, `Reschedule`
  secondary.
- Confirmation success screen was restructured into a clear hierarchy: kicker → 26px date
  → 18px time window → 14px address → 13px note. Em dash removed.

## 3. New: pre-delivery checklist card (states 3 and 4)

New card `Before your delivery` on the Overview tab, sourced from the rental contract:

- **Book your building's elevator** — contract §5 (missed appointment fee, COI, elevator
  reservation).
- **Check everything fits** — contract §5 (measurement / restocking). Links out to the
  product page for dimensions rather than duplicating measurements in the portal.
  URLs per set: `living-detail-page`, `dining-detail-page`, `bedding-detail-page`.
- `Submit` button, enabled only once both items are ticked; the card then collapses to a
  confirmed state with a `Review Again` escape hatch.

## 4. New: deposit / pre-authorisation messaging

Contract §2 (48-hour pre-auth, charge on delivery confirmation, refundable deposit) is now
surfaced in two places:

- **Welcome block** at the top of Overview for states 3/4 — warm one-liner, house icon,
  `Welcome home, {firstName}.`
- **Billing tab** gets a `Before delivery` card for states 3/4 with the split amounts
  (first month less the $25 already paid, plus one month deposit) and a
  `Hold, not a charge` badge.

Amounts are derived from `BACKEND.billing.monthlyAmount`; no new field required.

## 5. Mobile layout rework

- Hero is full-screen on mobile (`100svh` minus chrome) instead of a 280px band.
- New **compact status bar** that replaces the ROOMO header once the hero is dismissed.
  It carries the status label, the delivery date/time, and the state's primary action, so
  the urgent action is never more than one tap away. It lives **inside** the sticky
  sidebar so the two can never overlap.
- Hero is all-or-nothing: scrolling more than 24px folds it away; the chevron in the
  compact bar brings it back full-screen. There is deliberately no half-scrolled state.
- Sticky footer (`body` is a flex column) so short tabs do not leave the footer floating
  mid-page.
- Scroll snapping (`proximity`) so cards settle below the pinned chrome.
- Horizontal padding unified to 24px across header, content and footer on mobile.
- Profile row fixed at 54px so it cannot change height when it pins.

## 6. Bug fixes worth knowing about

These were pre-existing defects found along the way, not regressions from this work:

1. **Stray `</button>`** in the sidebar markup with no matching open tag.
2. **Horizontal overflow on the Billing tab** — `grid-template-columns: 1fr` and flex
   children default to `min-width: auto`, so the payments table pushed the content area
   wider than the viewport and the right padding was clipped. Fixed with `minmax(0, 1fr)`
   and `min-width: 0`.
3. **Modals could touch the screen edges** — flex items shrink past `max-width`, so the
   gutter has to come from padding on the overlay, not from the modal's own max-width.
4. **`getIncludedItemsList()` threw** if `plan.omit` was missing, which would blank the
   whole Overview. Now defaults to `{}`.
5. **`renderContent()` had no error boundary** — one bad card blanked the page. Now shows
   a recoverable error state.
6. **State 10 Delivery tab** rendered an empty string; now has an empty state.
7. **Inconsistent date formats** in the payments table (full month name on the failed row,
   abbreviated on history rows).

## 7. Cosmetic

- Body line-height standardised to 1.25 across the page (38 occurrences of 1.4–1.7).
- `Cancel order` links are now dark red (`#a03020`), with a lifted variant (`#e09280`) for
  the dark hero where the dark red would not read.
- Hero background is now a photograph with a legibility scrim; states 4 and 6 keep their
  green / red tint as a translucent wash over the photo.

---

## Verification performed

Layout was verified in headless Chromium at 390×844, not just by reading the code.
Measured results after the final change:

| Step | hero height | scrollY | correct |
|---|---|---|---|
| Initial load | 737px | 0 | full screen ✓ |
| Tap Overview | 0 | 0 | compact bar, content top at 175 ✓ |
| Tap chevron | 737px | 0 | full screen ✓ |
| Scroll away | 0 | 0 | compact bar ✓ |
| Tap chevron again | 737px | 0 | full screen ✓ |

All 10 statuses × 7 tabs render without runtime errors and without falling through to the
error state.

---

## Known TODOs

- `SET_DETAIL_URL` — the `dining` and `bedroom` slugs should be confirmed against the live
  site; only `living-detail-page` was verified.
- Checklist state is per-browser (`localStorage`), see §1.
- `public/preview.html` is a development harness. It iframes `account.html?demo=true` with
  a status switcher and device-size presets. Exclude it from production if you prefer.
