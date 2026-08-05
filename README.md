# Aroma Ceylon Business App V2 — Stable Complete Upgrade

This release is based on the uploaded `aroma-ceylon-v2-8` stable build. It preserves the existing authentication, income, expenses, employees, attendance, payroll, products, shops and sales flows, then adds the agreed upgrade without replacing those working foundations.

## Included modules

- Supabase authentication and role-based access
- Admin income and employee expense approvals
- Employees, attendance and private payroll/payslips
- Product catalogue and private product images
- Shops/customers with automatic shop codes
- Sales, deliveries, invoices and private PDFs
- Partial/full payments and automatic income synchronization
- Paid payroll and refund synchronization to approved expenses
- Protected inventory, stock movements and low-stock warnings
- Credit notes, partial product returns and refunds
- Monthly sales, outstanding, inventory and gross-profit reports
- Employee ↔ Admin named messages, attachments and replies
- Private, selected-employee and all-employee announcements
- English / සිංහල interface preference
- White + gold premium PDF family for payslips, invoices, delivery notes, receipts and credit notes

## Upgrade database step

Run `10_STABLE_COMPLETE_UPGRADE_PATCH.sql` once in Supabase SQL Editor **before** deploying this package. See `10_STABLE_COMPLETE_UPGRADE_SETUP.md` for the safe order and the note about older EUR records.

## Deployment

Replace the repository files with the contents of this project folder and commit. Netlify will build and deploy automatically.

Required existing Netlify variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never add a Supabase secret/service-role key to the frontend repository.
