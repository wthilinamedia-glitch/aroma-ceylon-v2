# Aroma Ceylon Business App V2 — Income & Expenses Update

This package adds:

- Admin income entry in EUR
- Date-specific EUR → LKR rate lookup with manual override
- Supabase-generated LKR income value
- Expense submission for admin and regular users
- Pending / approved / rejected workflow
- Admin approval and rejection controls
- Profit/loss dashboard using approved expenses only
- Private bill-photo uploads
- Client-side bill image compression before upload
- Signed private bill viewing links
- Mobile navigation and PWA-friendly UI

## Required database step

Run `02_expense_bill_storage.sql` once in Supabase SQL Editor before testing bill uploads.

## GitHub update

Replace the existing V2 repository files with the contents of this project folder and commit. Netlify will deploy automatically.

Your existing Netlify environment variables remain unchanged:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never add a Supabase secret key or service-role key to this frontend repository.


## V2.1 transaction controls

- Admin can edit or delete any income or expense transaction.
- Team members can edit or delete only their own pending expenses.
- Expense bill files are removed from private Storage when the transaction is deleted.
- Bill replacement/removal is available from the expense editor.
- Image compression now targets approximately 700 KB with iterative resize/quality reduction.
- Database RLS remains the final authorization layer; UI visibility alone is not relied upon.
- Existing audit triggers continue to record updates and deletions.


## V2.2 employees and dashboard cleanup

- Removed the duplicate dashboard quick-action cards; the sticky top navigation is the single navigation area.
- Added an Admin-only Employees page.
- Admin can invite regular users through a secure Supabase Edge Function.
- Employee details include name, phone, job title, monthly salary, salary currency and active status.
- Admin can edit profiles and activate/deactivate regular users.
- The only admin cannot deactivate their own account in the UI.
- Invitation links open a password-setup screen in the app.
- See `03_EMPLOYEES_SETUP.md` for the Edge Function and Auth URL setup.

## V2.3 Employee Workspace & Attendance

- Employee home hub with Submit Expense, My Expenses, My Attendance, My Payslips and My Profile.
- Admin attendance management by employee and month.
- Present, absent, half-day, leave, notes and clear/reset support.
- Employee read-only monthly attendance calendar and totals.
- Employee profile view and salary/payslip history placeholder using existing secure payroll data.
- Employee top navigation stays uncluttered: Home is the only persistent item; module pages return through Back to my home.


## V2.4 Products catalogue

- Admin-only product catalogue
- Product name, SKU, category, pack size, selling price and optional cost price
- EUR or LKR product pricing
- Optional compressed product photo in private Supabase Storage
- Search and active/archived filters
- Edit, archive and restore controls
- Database audit history

Run `05_PRODUCTS_SETUP.sql` before deploying this version.


## V2.5 Payroll & Payslips

Run `06_PAYROLL_PAYSLIPS_SETUP.sql` before deploying this update. The Payroll tab lets the administrator prepare drafts, finalize payroll, create a branded private PDF, mark salary paid, and allow each employee to download only their own finalized payslip.
