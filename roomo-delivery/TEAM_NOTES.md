# Roomo — My Account Preview · Team Notes

This file is for anyone maintaining or updating `roomo-account_preview.html`.  
Please follow the three rules below to keep the preview consistent.

---

## Rule 1 · All plan-related content must include a product image

Every card or section that displays plan details must show the associated product photograph.  
Use `planImageBlock(s)` inside horizontal plan cards (`.card-plan-h`), which reads the current plan object and resolves the correct image automatically.  
Never render plan text (set name, color, included items, pricing) without the accompanying image alongside it.

---

## Rule 2 · Date cards use the split-panel layout

Any card whose primary purpose is to communicate a date (delivery, return pickup, scheduling confirmation) must use the **split-panel format**:

- Use CSS classes `card card-delivery card-full` on the outer wrapper.
- Inside, add a `card-header` for the title and badge, then a `div.delivery-split` containing:
  - **Left panel** `div.delivery-date-block` — large date in `div.delivery-date-main` (font-size 28 px, `var(--font-heading)`, bold), time/subtitle in `div.delivery-time-main`.
  - **Right panel** `div.delivery-meta` — address rows, action buttons, and any supporting text.
- The CSS draws a vertical divider (`border-right`) between the two panels automatically.

Example skeleton:
```html
<div class="card card-delivery card-full animate-in">
  <div class="card-header"><span class="card-title">…</span><span class="card-badge …">…</span></div>
  <div class="delivery-split">
    <div class="delivery-date-block">
      <div class="delivery-date-main">June 12<br>2027</div>
      <div class="delivery-time-main">9 AM – 1 PM</div>
    </div>
    <div class="delivery-meta">
      <div class="card-row">…address…</div>
      <div class="card-actions">…buttons…</div>
    </div>
  </div>
</div>
```

Do **not** display dates as plain body text or inside small `card-row` labels.

---

## Rule 3 · Cards must always be full-width — no isolated small blocks

**Overview tab:** Every card must be `card-full`. Nothing in the Overview is ever placed side-by-side. All content stacks vertically at 100% width.

**Detail tabs (Billing, Delivery, etc.):** Cards may be placed side-by-side in a two-column grid only when both cards have comparable content volume. The non-negotiable constraint is: **if one card in a row is large, the other must also be `card-full` and stretch to match it**. There must never be a half-width card sitting next to empty whitespace.

Practical checklist:
- Payment, Autopay, billing summary, and payment history cards all use `card-full`.
- Date cards (see Rule 2) are always `card-full`.
- When adding a new card to a detail tab: if it would be the only card in its row, give it `card-full`. If pairing two cards of similar size, both get `card-full` so they stack (not float half-width). Side-by-side is only valid when the two-column grid is intentionally designed for it.
- Never let a grid cell be visually empty because the adjacent card is too narrow.

---

## Rule 4 · Image, "What's Included", price, and duration must always match

These four pieces of information must always be derived from the same plan object — either `demoPlan` (for statuses 1–2, draft/checkout flow) or `CONFIRMED_PLAN` (for statuses 3–10, after a plan is confirmed).  
**Never hardcode** values like "Living Room Set", "Hudson Haze", "$349 / month", or item lists.  
Always call the helper functions:

| What you need | Function to call |
|---|---|
| Set display name | `setLabel(plan.setId)` |
| Color display name | `colorDisplayName(plan.colorSlug)` |
| Included items list | `getIncludedItemsList(plan)` |
| Monthly price | `computeMonthly(plan.setId, plan.months, plan.omit)` |
| Product image path | `editImgPath()` (edit modal) · `planImageBlock(s)` (plan cards) |

To update the confirmed plan (e.g. when the real set/color changes), edit only the `CONFIRMED_PLAN` constant at the top of the `<script>` block — every section of the page that uses it will update automatically.

---

*Last updated: May 2026 · 4 rules — Rule 3 updated*
