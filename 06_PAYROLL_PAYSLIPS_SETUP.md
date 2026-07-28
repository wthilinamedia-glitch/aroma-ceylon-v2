# Payroll & PDF Payslips setup

1. Open Supabase Dashboard → SQL Editor → New query.
2. Run `06_PAYROLL_PAYSLIPS_SETUP.sql` once.
3. Upload this project update to the existing GitHub repository.
4. Netlify installs the new `jspdf` dependency during the build.

## What this adds

- Admin Payroll tab
- Monthly employee payroll drafts
- Attendance totals copied into payroll
- Bonus, allowance, deductions and salary advance
- Finalize and create branded PDF payslip
- Private Supabase Storage bucket for payslips
- Mark salary as paid and refresh the PDF
- Employee-only private PDF download

Attendance is shown on the payslip but does not change salary automatically. Any attendance-related salary deduction is entered explicitly in the deductions field.
