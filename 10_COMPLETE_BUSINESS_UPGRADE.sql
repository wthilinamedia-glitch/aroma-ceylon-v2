-- Aroma Ceylon Business App V2
-- Complete bilingual, inventory, accounting automation, credit notes, reports and messaging upgrade.
-- Run once AFTER the existing core, products, shops, payroll and sales setup SQL files.

begin;

-- ---------------------------------------------------------------------------
-- Language and customer defaults
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists preferred_language text not null default 'en'
  check (preferred_language in ('en', 'si'));

alter table public.shops
  add column if not exists preferred_language text not null default 'en'
  check (preferred_language in ('en', 'si')),
  add column if not exists default_tax_rate numeric(6,3) not null default 0
  check (default_tax_rate >= 0 and default_tax_rate <= 100),
  add column if not exists default_discount numeric(14,2) not null default 0
  check (default_discount >= 0),
  add column if not exists preferred_payment_method text not null default 'Bank transfer'
  check (preferred_payment_method in ('Cash', 'Bank transfer', 'Card', 'Other'));

create or replace function public.set_my_language(p_language text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if p_language not in ('en', 'si') then raise exception 'Unsupported language.'; end if;
  update public.profiles set preferred_language = p_language where id = auth.uid();
end;
$$;
revoke all on function public.set_my_language(text) from public;
grant execute on function public.set_my_language(text) to authenticated;


-- Paid payroll records are synchronized to approved expenses so profit stays accurate.
alter table public.payrolls
  add column if not exists exchange_rate_lkr numeric(14,4) not null default 1 check (exchange_rate_lkr > 0);

alter table public.expenses
  add column if not exists source_type text,
  add column if not exists source_id uuid;
create unique index if not exists expenses_source_unique_idx on public.expenses(source_type,source_id)
where source_type is not null and source_id is not null;

create or replace function public.sync_paid_payroll_expense()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_employee text; v_amount_lkr numeric(14,2); v_actor uuid;
begin
  if tg_op='DELETE' then
    delete from public.expenses where source_type='payroll' and source_id=old.id;
    return old;
  end if;
  if new.status='paid' then
    select coalesce(full_name,email,'Employee') into v_employee from public.profiles where id=new.employee_id;
    v_amount_lkr := round(new.net_salary * case when new.currency='EUR' then new.exchange_rate_lkr else 1 end,2);
    v_actor := coalesce(new.finalized_by,new.created_by);
    insert into public.expenses(title,category,amount_lkr,expense_date,note,status,submitted_by,reviewed_by,reviewed_at,source_type,source_id)
    values('Salary - '||v_employee,'Salary / Staff',v_amount_lkr,coalesce(new.paid_at::date,current_date),
      'Automatic expense from paid payroll '||to_char(new.period_start,'YYYY-MM'),'approved',v_actor,v_actor,coalesce(new.paid_at,now()),'payroll',new.id)
    on conflict(source_type,source_id) where source_type is not null and source_id is not null
    do update set title=excluded.title,amount_lkr=excluded.amount_lkr,expense_date=excluded.expense_date,
      note=excluded.note,status='approved',reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at;
  else
    delete from public.expenses where source_type='payroll' and source_id=new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists payroll_sync_expense on public.payrolls;
create trigger payroll_sync_expense after insert or update or delete on public.payrolls
for each row execute function public.sync_paid_payroll_expense();

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists stock_quantity numeric(14,3) not null default 0,
  add column if not exists reorder_level numeric(14,3) not null default 0,
  add column if not exists track_inventory boolean not null default true;

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('opening','adjustment','sale','return','credit','correction')),
  quantity numeric(14,3) not null check (quantity <> 0),
  balance_after numeric(14,3) not null,
  reason text,
  invoice_id uuid references public.sales_invoices(id) on delete set null,
  credit_note_id uuid,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_product_created_idx on public.stock_movements(product_id, created_at desc);
alter table public.stock_movements enable row level security;
drop policy if exists "stock_movements_admin_all" on public.stock_movements;
create policy "stock_movements_admin_all" on public.stock_movements for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

drop trigger if exists audit_stock_movements on public.stock_movements;
create trigger audit_stock_movements after insert or update or delete on public.stock_movements
for each row execute function public.write_audit_log();

create or replace function public.adjust_product_stock(p_product_id uuid, p_quantity numeric, p_reason text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare v_balance numeric(14,3);
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  if p_quantity is null or p_quantity = 0 then raise exception 'Adjustment cannot be zero.'; end if;
  update public.products
    set stock_quantity = round(stock_quantity + p_quantity, 3)
    where id = p_product_id and track_inventory = true
    returning stock_quantity into v_balance;
  if not found then raise exception 'Product is unavailable or inventory tracking is disabled.'; end if;
  if v_balance < 0 then raise exception 'Stock cannot be negative.'; end if;
  insert into public.stock_movements(product_id, movement_type, quantity, balance_after, reason, created_by)
  values (p_product_id, 'adjustment', round(p_quantity,3), v_balance, nullif(trim(p_reason),''), auth.uid());
  return v_balance;
end;
$$;
revoke all on function public.adjust_product_stock(uuid,numeric,text) from public;
grant execute on function public.adjust_product_stock(uuid,numeric,text) to authenticated;

-- Snapshot cost prices on invoice lines for reliable historic gross-profit reports.
alter table public.sales_invoice_items add column if not exists cost_price numeric(14,2) not null default 0;
update public.sales_invoice_items i set cost_price = coalesce(p.cost_price,0)
from public.products p where i.product_id = p.id and i.cost_price = 0;

create or replace function public.snapshot_invoice_item_cost()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.product_id is not null then
    select coalesce(cost_price,0) into new.cost_price from public.products where id = new.product_id;
  end if;
  return new;
end;
$$;
drop trigger if exists sales_invoice_items_snapshot_cost on public.sales_invoice_items;
create trigger sales_invoice_items_snapshot_cost before insert on public.sales_invoice_items
for each row execute function public.snapshot_invoice_item_cost();

create or replace function public.apply_delivered_invoice_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_balance numeric(14,3);
begin
  if new.delivery_status = 'delivered' and old.delivery_status is distinct from 'delivered' then
    for r in select product_id, quantity from public.sales_invoice_items where invoice_id = new.id and product_id is not null loop
      update public.products set stock_quantity = round(stock_quantity - r.quantity,3)
      where id = r.product_id and track_inventory = true
      returning stock_quantity into v_balance;
      if found then
        if v_balance < 0 then raise exception 'Insufficient stock for a delivered invoice.'; end if;
        insert into public.stock_movements(product_id,movement_type,quantity,balance_after,reason,invoice_id,created_by)
        values(r.product_id,'sale',-r.quantity,v_balance,'Delivered invoice '||new.invoice_code,new.id,auth.uid());
      end if;
    end loop;
  elsif old.delivery_status = 'delivered' and new.delivery_status is distinct from 'delivered' then
    raise exception 'A delivered invoice cannot be moved back. Use a credit note / return.';
  end if;
  return new;
end;
$$;
drop trigger if exists sales_invoice_apply_stock on public.sales_invoices;
create trigger sales_invoice_apply_stock after update of delivery_status on public.sales_invoices
for each row execute function public.apply_delivered_invoice_stock();

-- ---------------------------------------------------------------------------
-- Payment -> Income automation and receipts
-- ---------------------------------------------------------------------------
alter table public.sales_invoice_payments
  add column if not exists exchange_rate_lkr numeric(14,4) not null default 1 check (exchange_rate_lkr > 0),
  add column if not exists receipt_pdf_path text;

alter table public.income
  add column if not exists source_type text,
  add column if not exists source_id uuid;
create unique index if not exists income_source_unique_idx on public.income(source_type, source_id)
where source_type is not null and source_id is not null;

create or replace function public.sync_sales_payment_income()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_invoice public.sales_invoices%rowtype; v_shop_name text; v_eur numeric; v_rate numeric;
begin
  if tg_op = 'DELETE' then
    delete from public.income where source_type = 'sales_payment' and source_id = old.id;
    return old;
  end if;
  select * into v_invoice from public.sales_invoices where id = new.invoice_id;
  select shop_name into v_shop_name from public.shops where id = v_invoice.shop_id;
  if v_invoice.currency = 'EUR' then
    v_eur := new.amount;
    v_rate := new.exchange_rate_lkr;
  else
    v_eur := new.amount;
    v_rate := 1;
  end if;
  insert into public.income(store_name,received_date,amount_eur,exchange_rate,note,created_by,source_type,source_id)
  values(v_shop_name,new.payment_date,v_eur,v_rate,
    'Automatic income from '||v_invoice.invoice_code||' payment'||coalesce(' · Ref: '||new.reference,''),
    new.created_by,'sales_payment',new.id)
  on conflict (source_type,source_id) where source_type is not null and source_id is not null
  do update set store_name=excluded.store_name, received_date=excluded.received_date,
    amount_eur=excluded.amount_eur, exchange_rate=excluded.exchange_rate,
    note=excluded.note, created_by=excluded.created_by;
  return new;
end;
$$;
drop trigger if exists sales_payment_sync_income on public.sales_invoice_payments;
create trigger sales_payment_sync_income after insert or update or delete on public.sales_invoice_payments
for each row execute function public.sync_sales_payment_income();

-- ---------------------------------------------------------------------------
-- Credit notes and refunds
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.sales_credit_status as enum ('issued','refunded','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.sales_credit_notes (
  id uuid primary key default gen_random_uuid(),
  credit_number bigint generated by default as identity unique,
  credit_code text generated always as ('CRN-'||lpad(credit_number::text,6,'0')) stored unique,
  invoice_id uuid not null references public.sales_invoices(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  reason text not null,
  status public.sales_credit_status not null default 'issued',
  restore_stock boolean not null default false,
  refund_method text check (refund_method is null or refund_method in ('Cash','Bank transfer','Card','Other')),
  refund_reference text,
  credit_pdf_path text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  refunded_at timestamptz
);
create index if not exists sales_credit_notes_invoice_idx on public.sales_credit_notes(invoice_id,created_at desc);
alter table public.sales_credit_notes enable row level security;
drop policy if exists "sales_credit_notes_admin_all" on public.sales_credit_notes;
create policy "sales_credit_notes_admin_all" on public.sales_credit_notes for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
drop trigger if exists audit_sales_credit_notes on public.sales_credit_notes;
create trigger audit_sales_credit_notes after insert or update or delete on public.sales_credit_notes
for each row execute function public.write_audit_log();

-- Add FK after table exists.
do $$ begin
  alter table public.stock_movements add constraint stock_movements_credit_note_fk
    foreign key (credit_note_id) references public.sales_credit_notes(id) on delete set null;
exception when duplicate_object then null; end $$;

create or replace function public.issue_sales_credit_note(
  p_invoice_id uuid,
  p_amount numeric,
  p_reason text,
  p_restore_stock boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_invoice public.sales_invoices%rowtype; r record; v_balance numeric(14,3); v_existing numeric;
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  select * into v_invoice from public.sales_invoices where id=p_invoice_id and status not in ('draft','cancelled');
  if not found then raise exception 'A finalized invoice is required.'; end if;
  select coalesce(sum(amount),0) into v_existing from public.sales_credit_notes where invoice_id=p_invoice_id and status<>'cancelled';
  if p_amount is null or p_amount<=0 or p_amount+v_existing>v_invoice.total_amount+0.01 then
    raise exception 'Credit amount exceeds the available invoice value.';
  end if;
  insert into public.sales_credit_notes(invoice_id,amount,reason,restore_stock,created_by)
  values(p_invoice_id,round(p_amount,2),trim(p_reason),coalesce(p_restore_stock,false),auth.uid()) returning id into v_id;
  if p_restore_stock then
    for r in select product_id,quantity from public.sales_invoice_items where invoice_id=p_invoice_id and product_id is not null loop
      update public.products set stock_quantity=round(stock_quantity+r.quantity,3)
      where id=r.product_id and track_inventory=true returning stock_quantity into v_balance;
      if found then insert into public.stock_movements(product_id,movement_type,quantity,balance_after,reason,invoice_id,credit_note_id,created_by)
        values(r.product_id,'return',r.quantity,v_balance,'Returned goods for credit note',p_invoice_id,v_id,auth.uid()); end if;
    end loop;
  end if;
  return v_id;
end;
$$;
revoke all on function public.issue_sales_credit_note(uuid,numeric,text,boolean) from public;
grant execute on function public.issue_sales_credit_note(uuid,numeric,text,boolean) to authenticated;

-- Refunds are synchronized to approved expenses so cash-basis profit is reduced correctly.
alter table public.sales_credit_notes
  add column if not exists refund_exchange_rate_lkr numeric(14,4) not null default 1 check (refund_exchange_rate_lkr > 0);

create or replace function public.mark_sales_credit_refunded(
  p_credit_id uuid,
  p_method text,
  p_reference text default null,
  p_exchange_rate_lkr numeric default 1
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_currency text;
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  if p_method not in ('Cash','Bank transfer','Card','Other') then raise exception 'Unsupported refund method.'; end if;
  select i.currency into v_currency from public.sales_credit_notes c join public.sales_invoices i on i.id=c.invoice_id where c.id=p_credit_id and c.status='issued';
  if not found then raise exception 'Issued credit note not found.'; end if;
  if v_currency='EUR' and coalesce(p_exchange_rate_lkr,0)<=0 then raise exception 'A valid EUR to LKR exchange rate is required.'; end if;
  update public.sales_credit_notes set status='refunded',refund_method=p_method,refund_reference=nullif(trim(p_reference),''),
    refund_exchange_rate_lkr=case when v_currency='EUR' then p_exchange_rate_lkr else 1 end,refunded_at=now()
  where id=p_credit_id;
end;
$$;
revoke all on function public.mark_sales_credit_refunded(uuid,text,text,numeric) from public;
grant execute on function public.mark_sales_credit_refunded(uuid,text,text,numeric) to authenticated;

create or replace function public.sync_sales_refund_expense()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_invoice public.sales_invoices%rowtype; v_shop text; v_amount_lkr numeric(14,2);
begin
  if tg_op='DELETE' then
    delete from public.expenses where source_type='sales_refund' and source_id=old.id;
    return old;
  end if;
  if new.status='refunded' then
    select * into v_invoice from public.sales_invoices where id=new.invoice_id;
    select shop_name into v_shop from public.shops where id=v_invoice.shop_id;
    v_amount_lkr := round(new.amount * case when v_invoice.currency='EUR' then new.refund_exchange_rate_lkr else 1 end,2);
    insert into public.expenses(title,category,amount_lkr,expense_date,note,status,submitted_by,reviewed_by,reviewed_at,source_type,source_id)
    values('Customer refund - '||coalesce(v_shop,v_invoice.invoice_code),'Sales refund',v_amount_lkr,coalesce(new.refunded_at::date,current_date),
      'Automatic refund expense for '||v_invoice.invoice_code||' / '||new.credit_code,'approved',new.created_by,new.created_by,coalesce(new.refunded_at,now()),'sales_refund',new.id)
    on conflict(source_type,source_id) where source_type is not null and source_id is not null
    do update set title=excluded.title,amount_lkr=excluded.amount_lkr,expense_date=excluded.expense_date,note=excluded.note,status='approved',reviewed_at=excluded.reviewed_at;
  else
    delete from public.expenses where source_type='sales_refund' and source_id=new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists sales_credit_sync_refund_expense on public.sales_credit_notes;
create trigger sales_credit_sync_refund_expense after insert or update or delete on public.sales_credit_notes
for each row execute function public.sync_sales_refund_expense();

-- ---------------------------------------------------------------------------
-- Employee <-> Admin messages, announcements and attachments
-- ---------------------------------------------------------------------------
create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete restrict,
  subject text not null check (length(trim(subject)) between 1 and 200),
  category text not null default 'Other' check (category in ('Suggestion','Complaint','Issue','Leave / service request','Other','Announcement')),
  audience text not null default 'admin' check (audience in ('admin','private','selected','all')),
  confidential boolean not null default false,
  status text not null default 'open' check (status in ('open','read','replied','resolved','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.message_recipients (
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz,
  archived_at timestamptz,
  primary key(thread_id,recipient_id)
);
create table if not exists public.thread_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(trim(body)) between 1 and 10000),
  attachment_path text,
  created_at timestamptz not null default now()
);
create index if not exists message_threads_updated_idx on public.message_threads(updated_at desc);
create index if not exists message_recipients_user_idx on public.message_recipients(recipient_id,read_at);
create index if not exists thread_messages_thread_idx on public.thread_messages(thread_id,created_at);

drop trigger if exists message_threads_set_updated_at on public.message_threads;
create trigger message_threads_set_updated_at before update on public.message_threads
for each row execute function public.set_updated_at();
create or replace function public.add_thread_sender_recipient() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.message_recipients(thread_id,recipient_id,read_at)
  values(new.id,new.sender_id,now()) on conflict do nothing;
  return new;
end $$;
drop trigger if exists message_threads_add_sender_recipient on public.message_threads;
create trigger message_threads_add_sender_recipient after insert on public.message_threads
for each row execute function public.add_thread_sender_recipient();

create or replace function public.touch_message_thread() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update public.message_threads
    set updated_at=now(), status=case when status='resolved' then status else 'replied' end
    where id=new.thread_id;
  update public.message_recipients
    set read_at=case when recipient_id=new.sender_id then now() else null end
    where thread_id=new.thread_id;
  return new;
end $$;
drop trigger if exists thread_messages_touch_thread on public.thread_messages;
create trigger thread_messages_touch_thread after insert on public.thread_messages for each row execute function public.touch_message_thread();

drop trigger if exists audit_message_threads on public.message_threads;
create trigger audit_message_threads after insert or update or delete on public.message_threads for each row execute function public.write_audit_log();
drop trigger if exists audit_thread_messages on public.thread_messages;
create trigger audit_thread_messages after insert or update or delete on public.thread_messages for each row execute function public.write_audit_log();

alter table public.message_threads enable row level security;
alter table public.message_recipients enable row level security;
alter table public.thread_messages enable row level security;

drop policy if exists "message_threads_visible" on public.message_threads;
create policy "message_threads_visible" on public.message_threads for select to authenticated using (
  (select public.is_admin()) or sender_id=auth.uid() or exists(select 1 from public.message_recipients r where r.thread_id=id and r.recipient_id=auth.uid())
);
drop policy if exists "message_threads_create" on public.message_threads;
create policy "message_threads_create" on public.message_threads for insert to authenticated with check (sender_id=auth.uid());
drop policy if exists "message_threads_admin_update" on public.message_threads;
create policy "message_threads_admin_update" on public.message_threads for update to authenticated
using ((select public.is_admin()) or sender_id=auth.uid()) with check ((select public.is_admin()) or sender_id=auth.uid());

drop policy if exists "message_recipients_visible" on public.message_recipients;
create policy "message_recipients_visible" on public.message_recipients for select to authenticated
using ((select public.is_admin()) or recipient_id=auth.uid() or exists(select 1 from public.message_threads t where t.id=thread_id and t.sender_id=auth.uid()));
drop policy if exists "message_recipients_admin_insert" on public.message_recipients;
create policy "message_recipients_admin_insert" on public.message_recipients for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "message_recipients_own_update" on public.message_recipients;
create policy "message_recipients_own_update" on public.message_recipients for update to authenticated using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());

drop policy if exists "thread_messages_visible" on public.thread_messages;
create policy "thread_messages_visible" on public.thread_messages for select to authenticated using (
  (select public.is_admin()) or sender_id=auth.uid() or exists(select 1 from public.message_recipients r where r.thread_id=thread_messages.thread_id and r.recipient_id=auth.uid()) or exists(select 1 from public.message_threads t where t.id=thread_messages.thread_id and t.sender_id=auth.uid())
);
drop policy if exists "thread_messages_create" on public.thread_messages;
create policy "thread_messages_create" on public.thread_messages for insert to authenticated with check (
  sender_id=auth.uid() and ((select public.is_admin()) or exists(select 1 from public.message_threads t where t.id=thread_id and (t.sender_id=auth.uid() or exists(select 1 from public.message_recipients r where r.thread_id=t.id and r.recipient_id=auth.uid()))))
);

create or replace function public.add_admin_message_recipient(p_thread_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_admin uuid;
begin
  if not exists(select 1 from public.message_threads where id=p_thread_id and sender_id=auth.uid()) then raise exception 'Thread access denied.'; end if;
  select id into v_admin from public.profiles where role='admin' and active=true order by created_at limit 1;
  if v_admin is null then raise exception 'Administrator profile is unavailable.'; end if;
  insert into public.message_recipients(thread_id,recipient_id) values(p_thread_id,v_admin) on conflict do nothing;
end $$;
revoke all on function public.add_admin_message_recipient(uuid) from public;
grant execute on function public.add_admin_message_recipient(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('message-attachments','message-attachments',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','text/plain'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "message_attachments_insert" on storage.objects;
create policy "message_attachments_insert" on storage.objects for insert to authenticated with check (
  bucket_id='message-attachments' and (storage.foldername(name))[1]=auth.uid()::text
);
drop policy if exists "message_attachments_select" on storage.objects;
create policy "message_attachments_select" on storage.objects for select to authenticated using (
  bucket_id='message-attachments' and ((select public.is_admin()) or (storage.foldername(name))[1]=auth.uid()::text or exists(
    select 1 from public.message_recipients r where r.thread_id::text=(storage.foldername(name))[2] and r.recipient_id=auth.uid()
  ))
);

-- ---------------------------------------------------------------------------
-- Reporting views
-- ---------------------------------------------------------------------------
create or replace view public.sales_profit_report with (security_invoker=true) as
select i.id,i.invoice_code,i.invoice_date,i.shop_id,i.currency,i.status,
  i.total_amount,i.paid_amount,i.balance_amount,
  coalesce(sum(ii.quantity*ii.cost_price),0)::numeric(14,2) as cost_of_goods,
  (i.total_amount-coalesce(sum(ii.quantity*ii.cost_price),0))::numeric(14,2) as invoiced_gross_profit,
  case when i.total_amount>0 then (i.paid_amount/i.total_amount)*(i.total_amount-coalesce(sum(ii.quantity*ii.cost_price),0)) else 0 end::numeric(14,2) as realized_gross_profit
from public.sales_invoices i left join public.sales_invoice_items ii on ii.invoice_id=i.id
group by i.id;

create or replace view public.shop_outstanding_report with (security_invoker=true) as
select s.id as shop_id,s.shop_code,s.shop_name,s.default_currency,
  coalesce(sum(i.balance_amount) filter(where i.status not in ('draft','cancelled','paid')),0)::numeric(14,2) as outstanding_amount,
  count(i.id) filter(where i.status not in ('draft','cancelled','paid')) as open_invoices
from public.shops s left join public.sales_invoices i on i.shop_id=s.id group by s.id;

grant select on public.sales_profit_report, public.shop_outstanding_report to authenticated;

commit;
