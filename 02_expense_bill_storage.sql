-- Aroma Ceylon V2: private bill-photo storage
-- Run in Supabase Dashboard > SQL Editor after the core schema.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'expense-bills',
  'expense-bills',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Users upload only inside their own top-level folder: <auth.uid()>/...
drop policy if exists "expense bills insert own folder" on storage.objects;
create policy "expense bills insert own folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'expense-bills'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- The uploader and the single admin may view private bills.
drop policy if exists "expense bills select owner or admin" on storage.objects;
create policy "expense bills select owner or admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'expense-bills'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or (select public.is_admin())
  )
);

-- The uploader may update their own files; admin may manage all bills.
drop policy if exists "expense bills update owner or admin" on storage.objects;
create policy "expense bills update owner or admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'expense-bills'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or (select public.is_admin())
  )
)
with check (
  bucket_id = 'expense-bills'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or (select public.is_admin())
  )
);

-- The uploader or admin may delete a stored bill.
drop policy if exists "expense bills delete owner or admin" on storage.objects;
create policy "expense bills delete owner or admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'expense-bills'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or (select public.is_admin())
  )
);

commit;
