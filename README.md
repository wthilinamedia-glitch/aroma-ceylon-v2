# Aroma Ceylon Business App V2 — Stable Invoice Cleanup Release

This release preserves the stable complete upgrade and the transaction/attendance fixes, then adds safe test-invoice cleanup and real-invoice voiding.

## Included modules

- Supabase authentication and role-based access
- Income, expenses and approval flows
- Employees, stable attendance selection and payroll/payslips
- Products, shops/customers and inventory
- Sales, deliveries, invoices and private premium PDFs
- Partial/full payments and admin-only payment reversal
- Credit notes, returns and refunds
- English / සිංහල interface preference
- Employee ↔ Admin messaging and announcements
- Reports excluding test and void invoices
- Admin-only test-invoice deletion and real-invoice voiding

## Database step

Run the supplied combined SQL patch in Supabase SQL Editor before deploying this project. It safely re-applies the transaction/payment reversal patch and then adds the invoice cleanup patch.

## Deployment

Replace the repository files with the contents of this project folder and commit. Netlify will build and deploy automatically.

Required Netlify variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never add a Supabase secret/service-role key to the frontend repository.
