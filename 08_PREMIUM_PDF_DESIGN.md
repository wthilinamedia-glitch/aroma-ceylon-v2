# Premium PDF Design Update

This update redesigns the generated payslip PDF with the approved **white + gold premium classic** visual style.

## Changes

- White A4 background instead of a dark brown header block
- Logo placed inside a light, bordered brand panel for better contrast
- Gold top rule and section dividers
- Clean employee and attendance cards
- Balanced earnings and deductions columns
- Pale-gold net salary highlight
- Premium status badge and footer
- Print-friendly layout with lower ink usage
- Shared `src/lib/pdfBrand.ts` helpers ready for the upcoming invoice PDF

## Deployment

No Supabase SQL changes are required. Replace the project files with this update, commit to GitHub, and allow Netlify to deploy.

Previously generated payslips remain unchanged. Reopen a payroll as draft and finalize it again to regenerate that PDF with the new design.
