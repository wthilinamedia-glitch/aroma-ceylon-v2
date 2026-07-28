# Aroma Ceylon V2.3 — Employee Workspace & Attendance

No new SQL is required for this release. It uses the existing `attendance`, `profiles`, `expenses`, and `payrolls` tables and their Row Level Security policies from the V2 core schema.

## Admin test

1. Sign in as the administrator.
2. Open **Attendance**.
3. Select an employee and month.
4. Mark days as Present, Absent, Half day, or Leave.
5. Add an optional note or clear an entry.
6. Confirm the four monthly totals update.

## Employee test

1. Sign in through an invited employee account.
2. The Home hub should show:
   - Submit expense
   - My expenses
   - My attendance
   - My payslips
   - My profile
3. Open **My attendance** and confirm only that employee's records are visible.
4. Confirm admin-only income, approvals, employees, and business profit are not visible.

## Payslips

The employee page can already read finalized/paid payroll rows securely. PDF generation and download will be enabled in the later Payroll & Payslip module.
