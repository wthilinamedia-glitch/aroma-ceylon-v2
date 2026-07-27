# Employees module setup

## 1. Deploy the Edge Function

In Supabase Dashboard:

1. Open **Edge Functions**.
2. Create a new function named `invite-employee`.
3. Replace its code with the contents of:
   `supabase/functions/invite-employee/index.ts`
4. Deploy the function with JWT verification enabled.

The function uses Supabase's server-side secret key only inside the Edge Function. Never add a secret or service-role key to Netlify or the browser app.

## 2. Configure Auth URLs

In Supabase Dashboard, open **Authentication > URL Configuration**.

Set:

- **Site URL:** `https://aroma-ceylon-v2.netlify.app`
- Add the same URL under **Redirect URLs**:
  `https://aroma-ceylon-v2.netlify.app/**`

This allows an invited employee to open the email invitation and create a password in the app.

## 3. Deploy the frontend

Upload the project files to the existing GitHub repository. Netlify will build and deploy automatically.

## What changes in this release

- Removed duplicate dashboard action cards; main navigation is now the single navigation location.
- Added an Admin-only Employees page.
- Admin can invite employees, set job details, phone, salary and currency.
- Admin can edit profiles and activate/deactivate regular users.
- The sole admin cannot deactivate their own account from the UI.
- Invited employees can create a password from the invitation link.
