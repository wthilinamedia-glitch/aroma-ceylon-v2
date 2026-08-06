# Transaction & Attendance Fix

Run `11_TRANSACTION_ATTENDANCE_FIX.sql` in Supabase before deploying this build.

## Changes

- Automatic invoice-payment income rows now show **Reverse payment** for admins.
- Reversal atomically removes the payment and linked income, recalculates invoice balance/status, and invalidates stale receipt/invoice PDFs.
- Sales payment history uses the same reversal flow instead of a generic delete.
- Attendance keeps the selected employee after saving or clearing a status and after editing a note.
- Attendance and other active screens stay mounted during background data refreshes.
- The selected attendance employee is remembered for the admin account and only falls back when that employee no longer exists.
