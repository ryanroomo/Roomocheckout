# Roomo — Order Flow & Logistics Guide

_A plain-English walkthrough of what happens from the moment a customer places an order, and how to confirm an order is real. For the logistics / operations team._

---

## The 4 systems (and what each one does)

1. **Framer — the website (roomonyc.com).** Where customers browse sets, pick a color, choose Rent or Buy, set the lease length, and start checkout.
2. **Checkout app (checkout.roomonyc.com).** Our own app. It runs the payment page, all the behind-the-scenes logic, the **customer account portal**, and the internal **Admin dashboard** (where our team works).
3. **Stripe — payments.** Deposits, card holds, charges, monthly rent subscriptions, and refunds.
4. **Supabase — the database (source of truth).** Every customer, order, item, and payment is recorded here.

How they fit together: the customer touches **Framer + the payment page**; **Stripe** moves the money; **Supabase** records everything; **Admin** is where our team takes action.

---

## Step by step: what happens after a customer orders

### 1. Build a set _(customer, on the website)_
Picks Living / Dining / Bedroom, a color, **Rent or Buy**, lease length (4–12 months), and can remove items (e.g. bedroom without a mattress). Adds to cart.

### 2. Checkout _(customer)_
Cart → enter **ZIP** (we confirm we deliver there — NYC is free, Jersey City / Hoboken has a +$50 delivery fee) → pick a **delivery date + time window** (AM or PM) → enter **name, email, phone, address** → pay a **$25 refundable deposit** (their card is securely saved for later charges). A promo code, if any, is applied here.
➡️ An order is created with status **Pending**.

### 3. Deposit confirmed
Once the $25 clears, the order becomes **Deposit Paid**. The customer receives a **confirmation email** with a link to their account. The founder gets a **Telegram alert**. → This is now a real, paying customer with a scheduled delivery.

### 4. 48 hours before delivery — hold placed _(automatic)_
The system automatically places a **hold** on the saved card for the amount due at delivery: **first month + one month security deposit + any delivery fee − the $25 already paid** (for a Buy order: full price + delivery − $25). Order becomes **Authorized**.
> ⚠️ This is a **hold, not a charge yet**. In Stripe it shows as "pending / uncaptured". The money is not ours until we **capture** it at delivery (next step).

### 5. Delivery day — ⭐ LOGISTICS ACTION ⭐
1. **Deliver and assemble** the furniture at the customer's address (use the delivery date, time window, and address shown on the order).
2. In the **Admin dashboard**, open that order and click the green **"Confirm delivery & capture $XXX"** button.
   - This **actually charges** the held amount, and for rentals **starts the monthly subscription** for months 2+.
   - Order becomes **Active** (rental) or **Delivered** (purchase).

> 🚨 **Do not skip this.** If "Confirm delivery & capture" is never clicked, the hold **expires after ~7 days** and we never get paid. Capture on **every** delivery, ideally the same day.

### 6. During the rental _(automatic)_
Stripe charges the **monthly rent automatically** each month. The customer can see their status, dates, and payment history in their account portal.

### 7. End of term — return or buy-out _(logistics + admin)_
- **Return:** Admin → **"Schedule return"** (set a pickup date) → order becomes **Return Scheduled**. After the furniture is picked up, Admin → **"Complete return & refund deposit"** → the security deposit is refunded (minus any damage deduction) → order becomes **Completed**.
- **Buy-out:** if the customer decides to keep the furniture, Admin → **"Buy-out"** charges the remaining difference and they own it.

### 8. Cancellations / refunds
Before the 48-hour cutoff, a customer can **request a refund** in their portal. The team gets an email; Admin reviews and processes it (refunds the $25). Unpaid (Pending) orders cancel instantly.

---

## When money actually moves (quick reference)

| When | What happens to the card |
|---|---|
| At checkout | **$25 deposit** charged (refundable) |
| 48h before delivery | **Hold** placed: 1st month + security deposit + fee − $25 |
| On delivery (Admin capture) | The hold is **captured** = the real charge lands |
| Each month after (rentals) | **Monthly rent** charged automatically |
| On return | **Security deposit refunded** (minus any damage) |

---

## How to confirm an order is legit

Open **checkout.roomonyc.com/admin.html** and search by name or email. On the order you'll see:

- **Status** — Pending → Deposit Paid → Authorized → Active → Return Scheduled → Completed
- **Billing summary** — coupon used, amount charged so far, next charge + date
- **Payment history** — every charge, marked Succeeded / Pending / Failed
- **Delivery info** — date, time window, address, phone (everything logistics needs)
- A **Calendar** tab shows all upcoming deliveries by day

**A real, paid order** = status **Deposit Paid** (or beyond) with a **"$25 deposit — Succeeded"** line in the payment history.
Stripe = the money record. Supabase (shown inside Admin) = the order record. The two always match — if Admin shows a Succeeded deposit, the payment is genuine.

> Note on "pending" on a bank statement: after we capture, Stripe shows **Succeeded** immediately, but the customer's **bank** may still show "pending" for 1–3 business days until it settles. That is normal and does not mean anything is wrong.

---

## The statuses logistics cares about most

| Status | What it means for logistics |
|---|---|
| **Deposit Paid** | Confirmed & scheduled — a delivery is coming on the listed date |
| **Authorized** | Delivery is within 48h — get it ready |
| **Active / Delivered** | Delivered & captured — done (rental is running / item is owned) |
| **Return Scheduled** | Pickup is booked for the listed return date |
| **Completed** | Picked up, deposit refunded — closed out |
