# Test Invoice Cleanup & Real Invoice Void

This patch adds a safe admin-only cleanup workflow without changing the existing attendance, payroll, products, shops, messaging, accounting or payment-reversal behaviour.

## Invoice rules

- Draft real invoice: normal **Delete draft**.
- Existing finalized invoice used only for testing: **Mark as test**.
- Test invoice: excluded from Sales reports, outstanding totals, dashboard income and cash profit.
- Test invoice: admin can use **Delete test invoice** for permanent cleanup.
- Real finalized invoice: admin can use **Void invoice**. The record remains visible for audit history.

## Automatic cleanup

Deleting a test invoice or voiding a real invoice handles linked payments, generated income, invoice balances, credit notes, refund expenses, inventory movements and private PDF paths in one database transaction. Private Storage PDFs are then removed by the app.

A stock reversal is refused if it would make current stock negative. This protects inventory when returned test stock has already been consumed.
