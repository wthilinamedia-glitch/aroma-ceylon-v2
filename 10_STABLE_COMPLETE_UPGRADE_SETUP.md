# Aroma Ceylon V2 — Stable Complete Upgrade Setup

This release is rebuilt on the uploaded `aroma-ceylon-v2-8` stable baseline. Existing working flows are preserved while the bilingual UI, premium PDFs, automatic accounting, inventory, returns/refunds, reporting and employee messaging are added.

## 1. Database patch

Before deploying the app files, open **Supabase Dashboard → SQL Editor → New query** and run:

`10_STABLE_COMPLETE_UPGRADE_PATCH.sql`

Run this file only for this upgrade. It is transactional and safe to run whether the earlier complete-upgrade SQL succeeded or rolled back. Do not run any earlier experimental complete-upgrade script.

## 2. Existing EUR records

Older EUR payments, paid payrolls and refunds did not store an EUR → LKR exchange rate. The patch deliberately does **not** create accounting rows at an incorrect default rate of 1.

- Existing EUR invoice payment: delete and re-enter it with the real exchange rate.
- Existing paid EUR payroll: reopen the payroll as a draft, enter the real exchange rate, finalize it and mark it paid again.
- Existing EUR refund: review it before relying on the cash-profit dashboard.

New records require the exchange rate in the app and synchronize automatically.

## 3. Deploy

Replace the repository files with this package and commit to GitHub. Netlify should deploy automatically.

Keep the existing frontend environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never place a Supabase service-role key in the frontend repository.

## 4. First verification

Test in this order:

1. English / සිංහල selector on login and inside the app.
2. Existing expenses, attendance, products, shops and payroll flows.
3. Inventory opening quantity and audited adjustment.
4. Draft → finalized invoice and both PDFs.
5. Delivered status and stock deduction.
6. Partial/full payment, receipt PDF, automatic income and dashboard update.
7. Credit note, partial product return and refund accounting.
8. Reports.
9. Employee ↔ Admin private messages, selected messages and announcements.
