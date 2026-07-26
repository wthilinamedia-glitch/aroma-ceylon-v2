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
