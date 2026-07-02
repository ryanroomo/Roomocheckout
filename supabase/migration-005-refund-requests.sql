-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Migration 005 — Customer refund requests                     ║
-- ║  Run in Supabase SQL Editor (after earlier migrations)        ║
-- ╚══════════════════════════════════════════════════════════════╝
--
-- Customers can no longer self-refund from the portal. For a PAID order the
-- portal now files a *request* that an admin reviews and processes. These
-- columns record that request. (An UNPAID/pending order is still cancelled
-- immediately, since no money has moved.)
--
-- While refund_requested_at is set and the order is not yet processed, the
-- 48h pre-delivery pre-authorization cron skips the order (see cron/pre-delivery.js)
-- so the customer is not charged the big first-month + deposit while waiting.

alter table orders
  add column if not exists refund_requested_at   timestamptz,
  add column if not exists refund_request_reason text;

create index if not exists orders_refund_requested_idx on orders(refund_requested_at);
