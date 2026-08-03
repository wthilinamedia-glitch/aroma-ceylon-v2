# Aroma Ceylon V2 Complete Business Upgrade

Run `10_COMPLETE_BUSINESS_UPGRADE.sql` in Supabase SQL Editor after the existing core, products, shops, payroll and sales setup files.

This release preserves the existing flows and adds:
- English / Sinhala account language preference
- White-and-gold premium PDFs for payslips and sales documents
- Inventory movements and low-stock warnings
- Automatic payment-to-income and paid-payroll/refund-to-expense accounting
- Credit notes, refunds and business reports
- Named employee feedback, private/selected/all-employee messaging, attachments and unread indicators

After SQL succeeds, replace the GitHub project files with this package and let Netlify build it.
