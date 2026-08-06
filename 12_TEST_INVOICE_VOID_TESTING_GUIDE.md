# Aroma Ceylon V2 — Invoice Cleanup Testing Guide

## 1. Deploy check

1. Run the combined SQL patch.
2. Upload the project files to GitHub.
3. Wait for Netlify to publish.
4. Sign in as the admin and open **Sales**.

## 2. New test invoice

1. Open **New invoice**.
2. Turn on **Test invoice**.
3. Save the draft and finalize it.
4. Confirm the invoice card shows a gold **TEST** badge.
5. Confirm the invoice is absent from Reports and Sales summary totals.
6. Add a payment and confirm the dashboard income/cash profit does not increase.
7. Refresh PDFs and confirm the PDF status contains **TEST**.

## 3. Existing test data cleanup

1. Open an old invoice created only for testing.
2. Select **Mark as test**.
3. Confirm it disappears from reports and linked automatic income is removed.
4. Select **Delete test invoice**.
5. Confirm the invoice disappears from Sales history.
6. Confirm linked payment income, refund expense and report totals are removed.
7. If it had been delivered, confirm stock is restored.

## 4. Draft delete

1. Create a normal draft.
2. Confirm **Delete draft** removes it without affecting reports or stock.

## 5. Real invoice void

Use a disposable test record that is intentionally left as a real invoice for this check.

1. Finalize the invoice and optionally add payment/delivery activity.
2. Select **Void invoice** and enter a reason.
3. Confirm the invoice remains in history with **Void** status.
4. Confirm payments/income, outstanding balance, stock effect and reports are reversed.
5. Confirm the void reason appears in Invoice Details.

## 6. Regression checks

- Reverse payment still works.
- Attendance save keeps the selected employee and month.
- Products, shops, payroll, messages and language switching still open normally.
