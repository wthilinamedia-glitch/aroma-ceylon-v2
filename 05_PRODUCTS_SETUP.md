# V2.4 Products Module Setup

1. Open Supabase Dashboard → SQL Editor → New query.
2. Paste and run `05_PRODUCTS_SETUP.sql`.
3. Upload the updated project files to the existing GitHub repository.
4. Wait for Netlify to publish the new deploy.
5. Sign in as admin and open the `Products` tab.

The update creates:

- `products` database table
- Admin-only Row Level Security
- Unique SKU protection (case-insensitive)
- Private `product-images` Storage bucket
- Admin-only image access policies
- Audit history for product changes

Products are archived rather than permanently deleted so future delivery and invoice history can retain references safely.
