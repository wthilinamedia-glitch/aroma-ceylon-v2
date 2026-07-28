-- Aroma Ceylon V2: Payroll + private PDF payslips
-- Run once in Supabase Dashboard > SQL Editor.

begin;

alter table public.payrolls
  add column if not exists half_day_days numeric(5,1) not null default 0;

alter table public.payrolls
  drop constraint if exists payrolls_half_day_days_check;

alter table public.payrolls
  add constraint payrolls_half_day_days_check check (half_day_days >= 0);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payslips',
  'payslips',
  false,
  5242880,
  array['application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Admin can read every PDF; an employee can read only the folder named with their user id.
drop policy if exists "payslips_select_own_or_admin" on storage.objects;
create policy "payslips_select_own_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payslips'
  and (
    (select public.is_admin())
    or (storage.foldername(name))[1] = (select auth.uid())::text
  )
);

-- Only the admin application can create, replace, or remove payslip files.
drop policy if exists "payslips_admin_insert" on storage.objects;
create policy "payslips_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'payslips'
  and (select public.is_admin())
);

drop policy if exists "payslips_admin_update" on storage.objects;
create policy "payslips_admin_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'payslips'
  and (select public.is_admin())
)
with check (
  bucket_id = 'payslips'
  and (select public.is_admin())
);

drop policy if exists "payslips_admin_delete" on storage.objects;
create policy "payslips_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'payslips'
  and (select public.is_admin())
);

commit;
