# Aroma Ceylon Business App V2

This starter includes:

- React + TypeScript + Vite
- Supabase email/password authentication
- Profile-based admin/user detection
- Premium Aroma Ceylon branding using the supplied logo
- PWA manifest, icons and service worker shell
- Netlify build and SPA redirect configuration
- No private keys or service-role keys

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Get the Project URL and **publishable key** from Supabase's Connect panel.
3. Fill:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

4. Install and run:

```bash
npm install
npm run dev
```

## Netlify

Build command: `npm run build`
Publish directory: `dist`

Add the same two environment variables in Netlify project settings before deploying.

Never place a Supabase secret key or service-role key in this frontend project.
