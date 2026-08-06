# Aroma Ceylon V2 — Transaction & Attendance Fix Testing

## Required order

1. Run `11_TRANSACTION_ATTENDANCE_FIX.sql` in Supabase SQL Editor.
2. Deploy the project files.
3. Hard-refresh the live app once or close/reopen the installed PWA so service-worker cache v5 is active.

## Attendance test

1. Sign in as admin and open **Attendance**.
2. Select an employee who is not the first employee in the list.
3. Mark a date Present, Absent, Half day or Leave.
4. Confirm the selected employee and selected month do not change.
5. Add/edit a note and confirm the employee remains selected.
6. Clear one attendance status and confirm the employee remains selected.
7. Move to another tab and return to Attendance. The last selected employee should still be remembered for that admin account.

## Reverse payment test from Transactions

1. Use an invoice with a recorded payment.
2. Open **Transactions → Received payments**.
3. Confirm the automatic income row shows **Reverse payment**.
4. Select it and confirm the warning.
5. Verify:
   - the automatic income row disappears;
   - cash profit decreases by the payment's LKR value;
   - invoice paid amount decreases;
   - outstanding balance increases;
   - status changes to Unpaid or Partially paid when appropriate;
   - the old receipt is no longer available;
   - the stale invoice PDF is invalidated.
6. Open the invoice in Sales and use **Refresh PDFs** when the reversal was started from Transactions.

## Reverse payment test from Sales

1. Open the invoice and find its payment history.
2. Select **Reverse payment**.
3. Confirm income, balance and status are recalculated.
4. Confirm the invoice PDF is recreated automatically.

## Safety check

A payment connected to money already refunded should not be reversible. Supabase should return a validation error instead of creating an inconsistent balance.
