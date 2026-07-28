-- Aroma Ceylon Business App V2.4
-- Products catalogue + private product image storage
-- Run once in Supabase Dashboard > SQL Editor.

begin;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text not null,
  category text not null default 'Other',
  pack_size text,
  selling_price numeric(12,2) not null default 0 check (selling_price >= 0),
  cost_price numeric(12,2) check (cost_price is null or cost_price >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'LKR')),
  description text,
  photo_path text,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_sku_lower_unique
  on public.products (lower(sku));

create index if not exists products_active_name_idx
  on public.products (active, name);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists audit_products on public.products;
create trigger audit_products
after insert or update or delete on public.products
for each row execute function public.write_audit_log();

alter table public.products enable row level security;

drop policy if exists "products_admin_all" on public.products;
create policy "products_admin_all"
on public.products
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

grant select, insert, update, delete on public.products to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product_images_admin_select" on storage.objects;
create policy "product_images_admin_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'product-images'
  and (select public.is_admin())
);

drop policy if exists "product_images_admin_insert" on storage.objects;
create policy "product_images_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (select public.is_admin())
);

drop policy if exists "product_images_admin_update" on storage.objects;
create policy "product_images_admin_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and (select public.is_admin())
)
with check (
  bucket_id = 'product-images'
  and (select public.is_admin())
);

drop policy if exists "product_images_admin_delete" on storage.objects;
create policy "product_images_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (select public.is_admin())
);

commit;
