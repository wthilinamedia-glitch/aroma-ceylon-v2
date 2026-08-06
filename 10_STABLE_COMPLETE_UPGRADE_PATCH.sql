-- Aroma Ceylon Business App V2
-- Stable complete-upgrade fixes: bilingual preferences, protected accounting automation,
-- inventory, credit notes/partial returns, reporting and recursion-free messaging security.
-- Safe to run after the existing Core, Products, Payroll, Shops and Sales setup SQL files.

begin;

-- ---------------------------------------------------------------------------
-- Language and customer defaults
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists preferred_language text not null default 'en';

do $$ begin
  alter table public.profiles add constraint profiles_preferred_language_check
    check (preferred_language in ('en', 'si'));
exception when duplicate_object then null; end $$;

alter table public.shops
  add column if not exists preferred_language text not null default 'en',
  add column if not exists default_tax_rate numeric(6,3) not null default 0,
  add column if not exists default_discount numeric(14,2) not null default 0,
  add column if not exists preferred_payment_method text not null default 'Bank transfer';

do $$ begin
  alter table public.shops add constraint shops_preferred_language_check check (preferred_language in ('en', 'si'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.shops add constraint shops_default_tax_rate_check check (default_tax_rate between 0 and 100);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.shops add constraint shops_default_discount_check check (default_discount >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.shops add constraint shops_preferred_payment_method_check
    check (preferred_payment_method in ('Cash', 'Bank transfer', 'Card', 'Other'));
exception when duplicate_object then null; end $$;

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

-- ---------------------------------------------------------------------------
-- Protected accounting source records
-- ---------------------------------------------------------------------------
alter table public.payrolls
  add column if not exists exchange_rate_lkr numeric(14,4) not null default 1;
do $$ begin
  alter table public.payrolls add constraint payroll_exchange_rate_lkr_check check (exchange_rate_lkr > 0);
exception when duplicate_object then null; end $$;

alter table public.expenses
  add column if not exists source_type text,
  add column if not exists source_id uuid;
create unique index if not exists expenses_source_unique_idx
  on public.expenses(source_type, source_id)
  where source_type is not null and source_id is not null;

alter table public.income
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists source_currency text,
  add column if not exists source_amount numeric(14,2);
create unique index if not exists income_source_unique_idx
  on public.income(source_type, source_id)
  where source_type is not null and source_id is not null;


create or replace function public.protect_automatic_accounting_rows()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Automated payment/payroll/refund rows are maintained only by their source
  -- triggers. pg_trigger_depth() is greater than one for those nested writes.
  if pg_trigger_depth() <= 1 then
    if tg_op = 'INSERT' and new.source_type is not null then
      raise exception 'Automatic accounting records cannot be created manually.';
    elsif tg_op = 'UPDATE' and (old.source_type is not null or new.source_type is not null) then
      raise exception 'Automatic accounting records must be changed from their source transaction.';
    elsif tg_op = 'DELETE' and old.source_type is not null then
      raise exception 'Automatic accounting records must be changed from their source transaction.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists protect_automatic_income_rows on public.income;
create trigger protect_automatic_income_rows
  before insert or update or delete on public.income
  for each row execute function public.protect_automatic_accounting_rows();

drop trigger if exists protect_automatic_expense_rows on public.expenses;
create trigger protect_automatic_expense_rows
  before insert or update or delete on public.expenses
  for each row execute function public.protect_automatic_accounting_rows();

create or replace function public.sync_paid_payroll_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee text;
  v_amount_lkr numeric(14,2);
  v_actor uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.expenses where source_type = 'payroll' and source_id = old.id;
    return old;
  end if;

  if new.status = 'paid' then
    select coalesce(full_name, email, 'Employee') into v_employee
      from public.profiles where id = new.employee_id;
    v_amount_lkr := round(new.net_salary * case when new.currency = 'EUR' then new.exchange_rate_lkr else 1 end, 2);
    v_actor := coalesce(new.finalized_by, new.created_by);

    insert into public.expenses(
      title, category, amount_lkr, expense_date, note, status,
      submitted_by, reviewed_by, reviewed_at, source_type, source_id
    ) values (
      'Salary - ' || v_employee,
      'Salary / Staff',
      v_amount_lkr,
      coalesce(new.paid_at::date, current_date),
      'Automatic expense from paid payroll ' || to_char(new.period_start, 'YYYY-MM'),
      'approved', v_actor, v_actor, coalesce(new.paid_at, now()), 'payroll', new.id
    )
    on conflict (source_type, source_id) where source_type is not null and source_id is not null
    do update set
      title = excluded.title,
      amount_lkr = excluded.amount_lkr,
      expense_date = excluded.expense_date,
      note = excluded.note,
      status = 'approved',
      reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at;
  else
    delete from public.expenses where source_type = 'payroll' and source_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists payroll_sync_expense on public.payrolls;
create trigger payroll_sync_expense
  after insert or update or delete on public.payrolls
  for each row execute function public.sync_paid_payroll_expense();

-- ---------------------------------------------------------------------------
-- Inventory and historic cost snapshots
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists stock_quantity numeric(14,3) not null default 0,
  add column if not exists reorder_level numeric(14,3) not null default 0,
  add column if not exists track_inventory boolean not null default true;

do $$ begin
  alter table public.products add constraint products_stock_nonnegative_check check (stock_quantity >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.products add constraint products_reorder_nonnegative_check check (reorder_level >= 0);
exception when duplicate_object then null; end $$;

create or replace function public.protect_direct_product_stock_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.stock_quantity is distinct from old.stock_quantity
    and pg_trigger_depth() <= 1
    and coalesce(current_setting('aroma.allow_stock_change', true), 'off') <> 'on' then
    raise exception 'Use Inventory stock adjustment so every stock change is recorded.';
  end if;
  return new;
end;
$$;
drop trigger if exists products_protect_direct_stock on public.products;
create trigger products_protect_direct_stock
  before update of stock_quantity on public.products
  for each row execute function public.protect_direct_product_stock_changes();

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
create policy "stock_movements_admin_all" on public.stock_movements
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop trigger if exists audit_stock_movements on public.stock_movements;
create trigger audit_stock_movements after insert or update or delete on public.stock_movements
  for each row execute function public.write_audit_log();

create or replace function public.record_opening_product_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.track_inventory and new.stock_quantity > 0 then
    insert into public.stock_movements(product_id, movement_type, quantity, balance_after, reason, created_by)
    values(new.id, 'opening', new.stock_quantity, new.stock_quantity, 'Opening stock', coalesce(auth.uid(), new.created_by));
  end if;
  return new;
end;
$$;
drop trigger if exists products_record_opening_stock on public.products;
create trigger products_record_opening_stock after insert on public.products
  for each row execute function public.record_opening_product_stock();

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

  perform set_config('aroma.allow_stock_change', 'on', true);
  update public.products
    set stock_quantity = round(stock_quantity + p_quantity, 3)
    where id = p_product_id and track_inventory = true
    returning stock_quantity into v_balance;
  if not found then raise exception 'Product is unavailable or inventory tracking is disabled.'; end if;
  if v_balance < 0 then raise exception 'Stock cannot be negative.'; end if;

  insert into public.stock_movements(product_id, movement_type, quantity, balance_after, reason, created_by)
  values(p_product_id, 'adjustment', round(p_quantity,3), v_balance, nullif(trim(p_reason),''), auth.uid());
  return v_balance;
end;
$$;
revoke all on function public.adjust_product_stock(uuid,numeric,text) from public;
grant execute on function public.adjust_product_stock(uuid,numeric,text) to authenticated;

alter table public.sales_invoice_items
  add column if not exists cost_price numeric(14,2) not null default 0;
update public.sales_invoice_items i set cost_price = coalesce(p.cost_price, 0)
  from public.products p where i.product_id = p.id and i.cost_price = 0;

create or replace function public.snapshot_invoice_item_cost()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.product_id is not null then
    select coalesce(cost_price, 0) into new.cost_price from public.products where id = new.product_id;
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
    -- Check the total required quantity per product before changing any stock.
    for r in
      select i.product_id, sum(i.quantity)::numeric(14,3) as quantity, p.name, p.stock_quantity, p.track_inventory
      from public.sales_invoice_items i
      join public.products p on p.id = i.product_id
      where i.invoice_id = new.id and i.product_id is not null
      group by i.product_id, p.name, p.stock_quantity, p.track_inventory
    loop
      if r.track_inventory and r.stock_quantity + 0.0005 < r.quantity then
        raise exception 'Insufficient stock for %: available %, required %.', r.name, r.stock_quantity, r.quantity;
      end if;
    end loop;

    for r in
      select i.product_id, sum(i.quantity)::numeric(14,3) as quantity
      from public.sales_invoice_items i
      where i.invoice_id = new.id and i.product_id is not null
      group by i.product_id
    loop
      update public.products set stock_quantity = round(stock_quantity - r.quantity, 3)
        where id = r.product_id and track_inventory = true
        returning stock_quantity into v_balance;
      if found then
        insert into public.stock_movements(product_id,movement_type,quantity,balance_after,reason,invoice_id,created_by)
        values(r.product_id,'sale',-r.quantity,v_balance,'Delivered invoice ' || new.invoice_code,new.id,coalesce(auth.uid(),new.created_by));
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
-- Payments -> income, credit notes and adjusted invoice balances
-- ---------------------------------------------------------------------------
alter table public.sales_invoice_payments
  add column if not exists exchange_rate_lkr numeric(14,4) not null default 1,
  add column if not exists receipt_pdf_path text;
do $$ begin
  alter table public.sales_invoice_payments add constraint sales_payment_exchange_rate_check check (exchange_rate_lkr > 0);
exception when duplicate_object then null; end $$;

alter table public.sales_invoices
  add column if not exists credited_amount numeric(14,2) not null default 0;
do $$ begin
  alter table public.sales_invoices add constraint sales_invoices_credited_amount_check check (credited_amount >= 0 and credited_amount <= total_amount + 0.01);
exception when duplicate_object then null; end $$;

create or replace function public.sync_sales_payment_income()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.sales_invoices%rowtype;
  v_shop_name text;
  v_amount_for_generated_lkr numeric(14,2);
  v_rate numeric(14,4);
begin
  if tg_op = 'DELETE' then
    delete from public.income where source_type = 'sales_payment' and source_id = old.id;
    return old;
  end if;

  select * into v_invoice from public.sales_invoices where id = new.invoice_id;
  select shop_name into v_shop_name from public.shops where id = v_invoice.shop_id;

  if v_invoice.currency = 'EUR' then
    v_amount_for_generated_lkr := new.amount;
    v_rate := new.exchange_rate_lkr;
  else
    -- The legacy income table stores amount_eur * exchange_rate as LKR.
    -- For an original LKR payment, using rate 1 keeps the generated LKR amount correct.
    v_amount_for_generated_lkr := new.amount;
    v_rate := 1;
  end if;

  insert into public.income(
    store_name, received_date, amount_eur, exchange_rate, note, created_by,
    source_type, source_id, source_currency, source_amount
  ) values (
    v_shop_name,
    new.payment_date,
    v_amount_for_generated_lkr,
    v_rate,
    'Automatic income from ' || v_invoice.invoice_code || ' payment' || coalesce(' · Ref: ' || new.reference, ''),
    new.created_by,
    'sales_payment', new.id, v_invoice.currency, new.amount
  )
  on conflict (source_type, source_id) where source_type is not null and source_id is not null
  do update set
    store_name = excluded.store_name,
    received_date = excluded.received_date,
    amount_eur = excluded.amount_eur,
    exchange_rate = excluded.exchange_rate,
    note = excluded.note,
    created_by = excluded.created_by,
    source_currency = excluded.source_currency,
    source_amount = excluded.source_amount;
  return new;
end;
$$;
drop trigger if exists sales_payment_sync_income on public.sales_invoice_payments;
create trigger sales_payment_sync_income after insert or update or delete on public.sales_invoice_payments
  for each row execute function public.sync_sales_payment_income();

-- Credit notes

do $$ begin
  create type public.sales_credit_status as enum ('issued','refunded','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.sales_credit_notes (
  id uuid primary key default gen_random_uuid(),
  credit_number bigint generated by default as identity unique,
  credit_code text generated always as ('CRN-' || lpad(credit_number::text, 6, '0')) stored unique,
  invoice_id uuid not null references public.sales_invoices(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  reason text not null,
  status public.sales_credit_status not null default 'issued',
  restore_stock boolean not null default false,
  refund_method text check (refund_method is null or refund_method in ('Cash','Bank transfer','Card','Other')),
  refund_reference text,
  refund_exchange_rate_lkr numeric(14,4) not null default 1,
  credit_pdf_path text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  refunded_at timestamptz,
  cancelled_at timestamptz
);
alter table public.sales_credit_notes
  add column if not exists refund_exchange_rate_lkr numeric(14,4) not null default 1,
  add column if not exists cancelled_at timestamptz;
do $$ begin
  alter table public.sales_credit_notes add constraint sales_credit_refund_exchange_rate_check check (refund_exchange_rate_lkr > 0);
exception when duplicate_object then null; end $$;

create index if not exists sales_credit_notes_invoice_idx on public.sales_credit_notes(invoice_id, created_at desc);
alter table public.sales_credit_notes enable row level security;
drop policy if exists "sales_credit_notes_admin_all" on public.sales_credit_notes;
create policy "sales_credit_notes_admin_all" on public.sales_credit_notes
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop trigger if exists audit_sales_credit_notes on public.sales_credit_notes;
create trigger audit_sales_credit_notes after insert or update or delete on public.sales_credit_notes
  for each row execute function public.write_audit_log();

create table if not exists public.sales_credit_note_items (
  id uuid primary key default gen_random_uuid(),
  credit_note_id uuid not null references public.sales_credit_notes(id) on delete cascade,
  invoice_item_id uuid not null references public.sales_invoice_items(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  product_name text not null,
  sku text not null,
  pack_size text,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  cost_price numeric(14,2) not null default 0,
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index if not exists sales_credit_note_items_credit_idx on public.sales_credit_note_items(credit_note_id);
create index if not exists sales_credit_note_items_invoice_item_idx on public.sales_credit_note_items(invoice_item_id);
alter table public.sales_credit_note_items enable row level security;
drop policy if exists "sales_credit_note_items_admin_all" on public.sales_credit_note_items;
create policy "sales_credit_note_items_admin_all" on public.sales_credit_note_items
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop trigger if exists audit_sales_credit_note_items on public.sales_credit_note_items;
create trigger audit_sales_credit_note_items after insert or update or delete on public.sales_credit_note_items
  for each row execute function public.write_audit_log();

do $$ begin
  alter table public.stock_movements add constraint stock_movements_credit_note_fk
    foreign key (credit_note_id) references public.sales_credit_notes(id) on delete set null;
exception when duplicate_object then null; end $$;

create or replace function public.recalculate_sales_invoice_financials(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid numeric(14,2);
  v_credit numeric(14,2);
  v_total numeric(14,2);
  v_adjusted_total numeric(14,2);
  v_due date;
  v_current public.sales_invoice_status;
  v_status public.sales_invoice_status;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Administrator access is required.';
  end if;
  select total_amount, due_date, status into v_total, v_due, v_current
    from public.sales_invoices where id = p_invoice_id for update;
  if not found then return; end if;

  select coalesce(sum(amount), 0) into v_paid
    from public.sales_invoice_payments where invoice_id = p_invoice_id;
  select coalesce(sum(amount), 0) into v_credit
    from public.sales_credit_notes where invoice_id = p_invoice_id and status <> 'cancelled';

  v_paid := round(v_paid, 2);
  v_credit := least(round(v_credit, 2), v_total);
  v_adjusted_total := greatest(round(v_total - v_credit, 2), 0);

  if v_current = 'cancelled' then
    v_status := 'cancelled';
  elsif v_current = 'draft' then
    v_status := 'draft';
  elsif v_paid >= v_adjusted_total - 0.01 then
    v_status := 'paid';
  elsif v_due < current_date and v_adjusted_total - v_paid > 0.01 then
    v_status := 'overdue';
  elsif v_paid > 0 then
    v_status := 'partially_paid';
  else
    v_status := 'sent';
  end if;

  update public.sales_invoices set
    paid_amount = v_paid,
    credited_amount = v_credit,
    balance_amount = greatest(round(v_adjusted_total - v_paid, 2), 0),
    status = v_status
  where id = p_invoice_id;
end;
$$;
revoke all on function public.recalculate_sales_invoice_financials(uuid) from public;
grant execute on function public.recalculate_sales_invoice_financials(uuid) to authenticated;

create or replace function public.validate_sales_invoice_payment()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_total numeric(14,2);
  v_credit numeric(14,2);
  v_current_paid numeric(14,2);
  v_prospective_paid numeric(14,2);
  v_refunded numeric(14,2);
  v_adjusted_total numeric(14,2);
  v_status public.sales_invoice_status;
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;

  v_invoice_id := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    raise exception 'A payment cannot be moved to another invoice.';
  end if;

  select total_amount, credited_amount, status
    into v_total, v_credit, v_status
    from public.sales_invoices where id = v_invoice_id for update;
  if not found then raise exception 'Invoice not found.'; end if;
  if tg_op = 'INSERT' and v_status in ('draft', 'cancelled') then
    raise exception 'Payments cannot be added to this invoice.';
  end if;
  if tg_op <> 'DELETE' and new.amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  select coalesce(sum(amount),0) into v_current_paid
    from public.sales_invoice_payments where invoice_id = v_invoice_id;
  v_prospective_paid := case
    when tg_op = 'INSERT' then v_current_paid + new.amount
    when tg_op = 'UPDATE' then v_current_paid - old.amount + new.amount
    else v_current_paid - old.amount
  end;
  v_adjusted_total := greatest(v_total - v_credit, 0);

  -- Existing overpayments created by a later credit note may remain unchanged,
  -- but a new/increased payment cannot exceed the current adjusted invoice total.
  if v_prospective_paid > v_current_paid + 0.01 and v_prospective_paid > v_adjusted_total + 0.01 then
    raise exception 'Payment is greater than the outstanding balance.';
  end if;

  select coalesce(sum(amount),0) into v_refunded
    from public.sales_credit_notes
    where invoice_id = v_invoice_id and status = 'refunded';
  if v_refunded > greatest(v_prospective_paid - v_adjusted_total, 0) + 0.01 then
    raise exception 'This payment change would remove money that has already been refunded.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.recalculate_sales_invoice_after_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_invoice_id uuid;
begin
  v_invoice_id := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  perform public.recalculate_sales_invoice_financials(v_invoice_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists sales_invoice_payment_validate on public.sales_invoice_payments;
create trigger sales_invoice_payment_validate before insert or update or delete on public.sales_invoice_payments
  for each row execute function public.validate_sales_invoice_payment();
drop trigger if exists sales_invoice_payment_recalculate on public.sales_invoice_payments;
create trigger sales_invoice_payment_recalculate after insert or update or delete on public.sales_invoice_payments
  for each row execute function public.recalculate_sales_invoice_after_payment();

create or replace function public.recalculate_invoice_after_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_invoice_id uuid;
begin
  v_invoice_id := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  perform public.recalculate_sales_invoice_financials(v_invoice_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists sales_credit_recalculate_invoice on public.sales_credit_notes;
create trigger sales_credit_recalculate_invoice after insert or update or delete on public.sales_credit_notes
  for each row execute function public.recalculate_invoice_after_credit();

create or replace function public.refresh_sales_invoice_statuses()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare r record; v_count integer := 0;
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  for r in select id from public.sales_invoices where status not in ('draft','cancelled') loop
    perform public.recalculate_sales_invoice_financials(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Remove the earlier all-items return RPC. The V2 function below records
-- exact returned quantities and prevents duplicate stock restoration.
drop function if exists public.issue_sales_credit_note(uuid,numeric,text,boolean);

create or replace function public.issue_sales_credit_note_v2(
  p_invoice_id uuid,
  p_amount numeric,
  p_reason text,
  p_return_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_invoice public.sales_invoices%rowtype;
  v_existing numeric(14,2);
  v_item jsonb;
  v_invoice_item public.sales_invoice_items%rowtype;
  v_quantity numeric(12,3);
  v_already_returned numeric(12,3);
  v_balance numeric(14,3);
  v_has_returns boolean := false;
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  select * into v_invoice from public.sales_invoices where id = p_invoice_id and status not in ('draft','cancelled');
  if not found then raise exception 'A finalized invoice is required.'; end if;
  if trim(coalesce(p_reason,'')) = '' then raise exception 'Enter a credit-note reason.'; end if;

  select coalesce(sum(amount),0) into v_existing
    from public.sales_credit_notes where invoice_id = p_invoice_id and status <> 'cancelled';
  if p_amount is null or p_amount <= 0 or p_amount + v_existing > v_invoice.total_amount + 0.01 then
    raise exception 'Credit amount exceeds the available invoice value.';
  end if;

  if p_return_items is null or jsonb_typeof(p_return_items) <> 'array' then p_return_items := '[]'::jsonb; end if;
  v_has_returns := jsonb_array_length(p_return_items) > 0;
  if v_has_returns and v_invoice.delivery_status <> 'delivered' then
    raise exception 'Stock can only be returned from a delivered invoice.';
  end if;

  insert into public.sales_credit_notes(invoice_id, amount, reason, restore_stock, created_by)
  values(p_invoice_id, round(p_amount,2), trim(p_reason), v_has_returns, auth.uid())
  returning id into v_id;

  if v_has_returns then perform set_config('aroma.allow_stock_change', 'on', true); end if;
  for v_item in select value from jsonb_array_elements(p_return_items) loop
    v_quantity := round(coalesce(nullif(v_item->>'quantity','')::numeric,0),3);
    if v_quantity <= 0 then continue; end if;

    select * into v_invoice_item from public.sales_invoice_items
      where id = nullif(v_item->>'invoice_item_id','')::uuid and invoice_id = p_invoice_id;
    if not found then raise exception 'A selected return item is invalid.'; end if;

    select coalesce(sum(ci.quantity),0) into v_already_returned
      from public.sales_credit_note_items ci
      join public.sales_credit_notes c on c.id = ci.credit_note_id
      where ci.invoice_item_id = v_invoice_item.id and c.status <> 'cancelled';

    if v_quantity > v_invoice_item.quantity - v_already_returned + 0.0005 then
      raise exception 'Return quantity exceeds the available quantity for %.', v_invoice_item.product_name;
    end if;

    insert into public.sales_credit_note_items(
      credit_note_id, invoice_item_id, product_id, product_name, sku, pack_size,
      quantity, unit_price, cost_price, line_total
    ) values (
      v_id, v_invoice_item.id, v_invoice_item.product_id, v_invoice_item.product_name,
      v_invoice_item.sku, v_invoice_item.pack_size, v_quantity, v_invoice_item.unit_price,
      v_invoice_item.cost_price, round(v_quantity * v_invoice_item.unit_price,2)
    );

    if v_invoice_item.product_id is not null then
      update public.products set stock_quantity = round(stock_quantity + v_quantity,3)
        where id = v_invoice_item.product_id and track_inventory = true
        returning stock_quantity into v_balance;
      if found then
        insert into public.stock_movements(product_id,movement_type,quantity,balance_after,reason,invoice_id,credit_note_id,created_by)
        values(v_invoice_item.product_id,'return',v_quantity,v_balance,'Returned goods for credit note',p_invoice_id,v_id,auth.uid());
      end if;
    end if;
  end loop;

  perform public.recalculate_sales_invoice_financials(p_invoice_id);
  return v_id;
end;
$$;
revoke all on function public.issue_sales_credit_note_v2(uuid,numeric,text,jsonb) from public;
grant execute on function public.issue_sales_credit_note_v2(uuid,numeric,text,jsonb) to authenticated;

create or replace function public.cancel_sales_credit_note(p_credit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_credit public.sales_credit_notes%rowtype; r record; v_balance numeric(14,3);
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  select * into v_credit from public.sales_credit_notes where id = p_credit_id and status = 'issued' for update;
  if not found then raise exception 'Only an issued credit note can be cancelled.'; end if;

  perform set_config('aroma.allow_stock_change', 'on', true);
  for r in select * from public.sales_credit_note_items where credit_note_id = p_credit_id loop
    if r.product_id is not null then
      update public.products set stock_quantity = round(stock_quantity - r.quantity,3)
        where id = r.product_id and track_inventory = true
        returning stock_quantity into v_balance;
      if found then
        if v_balance < 0 then raise exception 'Credit note cannot be cancelled because returned stock has already been used.'; end if;
        insert into public.stock_movements(product_id,movement_type,quantity,balance_after,reason,invoice_id,credit_note_id,created_by)
        values(r.product_id,'correction',-r.quantity,v_balance,'Cancelled credit note return',v_credit.invoice_id,p_credit_id,auth.uid());
      end if;
    end if;
  end loop;

  update public.sales_credit_notes set status = 'cancelled', cancelled_at = now() where id = p_credit_id;
  perform public.recalculate_sales_invoice_financials(v_credit.invoice_id);
end;
$$;
revoke all on function public.cancel_sales_credit_note(uuid) from public;
grant execute on function public.cancel_sales_credit_note(uuid) to authenticated;

create or replace function public.mark_sales_credit_refunded(
  p_credit_id uuid,
  p_method text,
  p_reference text default null,
  p_exchange_rate_lkr numeric default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_currency text;
  v_invoice_id uuid;
  v_credit_amount numeric(14,2);
  v_paid numeric(14,2);
  v_total numeric(14,2);
  v_credited numeric(14,2);
  v_already_refunded numeric(14,2);
  v_available numeric(14,2);
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  if p_method not in ('Cash','Bank transfer','Card','Other') then raise exception 'Unsupported refund method.'; end if;

  select c.invoice_id, c.amount, i.currency, i.paid_amount, i.total_amount, i.credited_amount
    into v_invoice_id, v_credit_amount, v_currency, v_paid, v_total, v_credited
    from public.sales_credit_notes c
    join public.sales_invoices i on i.id = c.invoice_id
    where c.id = p_credit_id and c.status = 'issued'
    for update of c, i;
  if not found then raise exception 'Issued credit note not found.'; end if;

  select coalesce(sum(amount),0) into v_already_refunded
    from public.sales_credit_notes
    where invoice_id = v_invoice_id and status = 'refunded';
  v_available := greatest(round(v_paid - greatest(v_total - v_credited, 0) - v_already_refunded, 2), 0);

  if v_credit_amount > v_available + 0.01 then
    raise exception 'Only % is currently available for a cash refund. This credit note also reduces an unpaid balance.', v_available;
  end if;
  if v_currency = 'EUR' and coalesce(p_exchange_rate_lkr,0) <= 0 then
    raise exception 'A valid EUR to LKR exchange rate is required.';
  end if;

  update public.sales_credit_notes set
    status = 'refunded',
    refund_method = p_method,
    refund_reference = nullif(trim(p_reference),''),
    refund_exchange_rate_lkr = case when v_currency = 'EUR' then p_exchange_rate_lkr else 1 end,
    refunded_at = now()
  where id = p_credit_id;
end;
$$;
revoke all on function public.mark_sales_credit_refunded(uuid,text,text,numeric) from public;
grant execute on function public.mark_sales_credit_refunded(uuid,text,text,numeric) to authenticated;

create or replace function public.sync_sales_refund_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.sales_invoices%rowtype;
  v_shop text;
  v_amount_lkr numeric(14,2);
begin
  if tg_op = 'DELETE' then
    delete from public.expenses where source_type = 'sales_refund' and source_id = old.id;
    return old;
  end if;

  if new.status = 'refunded' then
    select * into v_invoice from public.sales_invoices where id = new.invoice_id;
    select shop_name into v_shop from public.shops where id = v_invoice.shop_id;
    v_amount_lkr := round(new.amount * case when v_invoice.currency = 'EUR' then new.refund_exchange_rate_lkr else 1 end, 2);

    insert into public.expenses(
      title, category, amount_lkr, expense_date, note, status,
      submitted_by, reviewed_by, reviewed_at, source_type, source_id
    ) values (
      'Customer refund - ' || coalesce(v_shop, v_invoice.invoice_code),
      'Sales refund', v_amount_lkr, coalesce(new.refunded_at::date,current_date),
      'Automatic refund expense for ' || v_invoice.invoice_code || ' / ' || new.credit_code,
      'approved', new.created_by, new.created_by, coalesce(new.refunded_at,now()),
      'sales_refund', new.id
    )
    on conflict (source_type, source_id) where source_type is not null and source_id is not null
    do update set
      title = excluded.title,
      amount_lkr = excluded.amount_lkr,
      expense_date = excluded.expense_date,
      note = excluded.note,
      status = 'approved',
      reviewed_at = excluded.reviewed_at;
  else
    delete from public.expenses where source_type = 'sales_refund' and source_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists sales_credit_sync_refund_expense on public.sales_credit_notes;
create trigger sales_credit_sync_refund_expense after insert or update or delete on public.sales_credit_notes
  for each row execute function public.sync_sales_refund_expense();

-- ---------------------------------------------------------------------------
-- Recursion-free Employee <-> Admin messaging
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

create or replace function public.can_access_message_thread(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_admin()
    or exists(select 1 from public.message_threads t where t.id = p_thread_id and t.sender_id = auth.uid())
    or exists(select 1 from public.message_recipients r where r.thread_id = p_thread_id and r.recipient_id = auth.uid())
  );
$$;
revoke all on function public.can_access_message_thread(uuid) from public;
grant execute on function public.can_access_message_thread(uuid) to authenticated;

create or replace function public.add_thread_sender_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.message_recipients(thread_id,recipient_id,read_at)
  values(new.id,new.sender_id,now()) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists message_threads_add_sender_recipient on public.message_threads;
create trigger message_threads_add_sender_recipient after insert on public.message_threads
  for each row execute function public.add_thread_sender_recipient();

create or replace function public.touch_message_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  select count(*) into v_count from public.thread_messages where thread_id = new.thread_id;
  update public.message_threads set
    updated_at = now(),
    status = case
      when status in ('resolved','archived') then status
      when v_count <= 1 then 'open'
      else 'replied'
    end
  where id = new.thread_id;

  update public.message_recipients set
    read_at = case when recipient_id = new.sender_id then now() else null end
  where thread_id = new.thread_id;
  return new;
end;
$$;
drop trigger if exists thread_messages_touch_thread on public.thread_messages;
create trigger thread_messages_touch_thread after insert on public.thread_messages
  for each row execute function public.touch_message_thread();

drop trigger if exists message_threads_set_updated_at on public.message_threads;
create trigger message_threads_set_updated_at before update on public.message_threads
  for each row execute function public.set_updated_at();

drop trigger if exists audit_message_threads on public.message_threads;
create trigger audit_message_threads after insert or update or delete on public.message_threads
  for each row execute function public.write_audit_log();
drop trigger if exists audit_thread_messages on public.thread_messages;
create trigger audit_thread_messages after insert or update or delete on public.thread_messages
  for each row execute function public.write_audit_log();

alter table public.message_threads enable row level security;
alter table public.message_recipients enable row level security;
alter table public.thread_messages enable row level security;

create or replace function public.protect_message_recipient_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.thread_id is distinct from old.thread_id or new.recipient_id is distinct from old.recipient_id then
    raise exception 'Message recipient identity cannot be changed.';
  end if;
  return new;
end;
$$;
drop trigger if exists message_recipients_protect_identity on public.message_recipients;
create trigger message_recipients_protect_identity
  before update on public.message_recipients
  for each row execute function public.protect_message_recipient_identity();

-- Drop all known old policies, including the mutually recursive versions.
drop policy if exists "message_threads_visible" on public.message_threads;
drop policy if exists "message_threads_create" on public.message_threads;
drop policy if exists "message_threads_admin_update" on public.message_threads;
drop policy if exists "message_threads_select" on public.message_threads;
drop policy if exists "message_threads_insert" on public.message_threads;
drop policy if exists "message_threads_update" on public.message_threads;
create policy "message_threads_select" on public.message_threads for select to authenticated
  using (public.can_access_message_thread(id));
create policy "message_threads_insert" on public.message_threads for insert to authenticated
  with check (
    sender_id = auth.uid()
    and status = 'open'
    and (
      (select public.is_admin())
      or (
        audience = 'admin'
        and category <> 'Announcement'
        and (category <> 'Complaint' or confidential = true)
      )
    )
  );
create policy "message_threads_update" on public.message_threads for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "message_recipients_visible" on public.message_recipients;
drop policy if exists "message_recipients_admin_insert" on public.message_recipients;
drop policy if exists "message_recipients_own_update" on public.message_recipients;
drop policy if exists "message_recipients_select" on public.message_recipients;
drop policy if exists "message_recipients_insert" on public.message_recipients;
drop policy if exists "message_recipients_update" on public.message_recipients;
create policy "message_recipients_select" on public.message_recipients for select to authenticated
  using ((select public.is_admin()) or recipient_id = auth.uid());
create policy "message_recipients_insert" on public.message_recipients for insert to authenticated
  with check ((select public.is_admin()));
create policy "message_recipients_update" on public.message_recipients for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

drop policy if exists "thread_messages_visible" on public.thread_messages;
drop policy if exists "thread_messages_create" on public.thread_messages;
drop policy if exists "thread_messages_select" on public.thread_messages;
drop policy if exists "thread_messages_insert" on public.thread_messages;
create policy "thread_messages_select" on public.thread_messages for select to authenticated
  using (public.can_access_message_thread(thread_id));
create policy "thread_messages_insert" on public.thread_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_access_message_thread(thread_id)
    and exists(
      select 1 from public.message_threads t
      where t.id = thread_id and t.status not in ('resolved','archived')
    )
  );

create or replace function public.add_admin_message_recipient(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_admin uuid;
begin
  if not exists(select 1 from public.message_threads where id = p_thread_id and sender_id = auth.uid()) then
    raise exception 'Thread access denied.';
  end if;
  select id into v_admin from public.profiles
    where role = 'admin' and active = true order by created_at limit 1;
  if v_admin is null then raise exception 'Administrator profile is unavailable.'; end if;
  insert into public.message_recipients(thread_id,recipient_id)
  values(p_thread_id,v_admin) on conflict do nothing;
end;
$$;
revoke all on function public.add_admin_message_recipient(uuid) from public;
grant execute on function public.add_admin_message_recipient(uuid) to authenticated;

create or replace function public.delete_empty_message_thread(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  delete from public.message_threads t
    where t.id = p_thread_id
      and t.sender_id = auth.uid()
      and not exists(select 1 from public.thread_messages m where m.thread_id = t.id);
end;
$$;
revoke all on function public.delete_empty_message_thread(uuid) from public;
grant execute on function public.delete_empty_message_thread(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('message-attachments','message-attachments',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','text/plain'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "message_attachments_insert" on storage.objects;
drop policy if exists "message_attachments_select" on storage.objects;
drop policy if exists "message_attachments_owner_delete" on storage.objects;
create policy "message_attachments_insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists(
    select 1 from public.message_threads t
    where t.id::text = (storage.foldername(name))[2]
      and public.can_access_message_thread(t.id)
  )
);
create policy "message_attachments_select" on storage.objects for select to authenticated using (
  bucket_id = 'message-attachments'
  and exists(
    select 1 from public.message_threads t
    where t.id::text = (storage.foldername(name))[2]
      and public.can_access_message_thread(t.id)
  )
);
create policy "message_attachments_owner_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'message-attachments'
  and ((storage.foldername(name))[1] = auth.uid()::text or (select public.is_admin()))
);

-- Add message tables to Supabase Realtime when the publication is available.
do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='message_threads') then
      alter publication supabase_realtime add table public.message_threads;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='thread_messages') then
      alter publication supabase_realtime add table public.thread_messages;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='message_recipients') then
      alter publication supabase_realtime add table public.message_recipients;
    end if;
  end if;
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- Corrected reporting views
-- ---------------------------------------------------------------------------
-- The previous upgrade used a different column order. PostgreSQL cannot
-- replace that view in-place when columns move, so recreate both views safely.
drop view if exists public.sales_profit_report;
drop view if exists public.shop_outstanding_report;

create view public.sales_profit_report with (security_invoker=true) as
with item_costs as (
  select invoice_id, coalesce(sum(quantity * cost_price),0)::numeric(14,2) as original_cogs
  from public.sales_invoice_items group by invoice_id
),
credit_totals as (
  select invoice_id, coalesce(sum(amount),0)::numeric(14,2) as credit_amount
  from public.sales_credit_notes where status <> 'cancelled' group by invoice_id
),
return_costs as (
  select c.invoice_id, coalesce(sum(ci.quantity * ci.cost_price),0)::numeric(14,2) as returned_cogs
  from public.sales_credit_note_items ci
  join public.sales_credit_notes c on c.id = ci.credit_note_id
  where c.status <> 'cancelled'
  group by c.invoice_id
)
select
  i.id, i.invoice_code, i.invoice_date, i.shop_id, i.currency, i.status,
  i.total_amount, i.credited_amount, i.paid_amount, i.balance_amount,
  greatest(i.total_amount - coalesce(ct.credit_amount,0),0)::numeric(14,2) as net_sales,
  greatest(coalesce(ic.original_cogs,0) - coalesce(rc.returned_cogs,0),0)::numeric(14,2) as cost_of_goods,
  (greatest(i.total_amount - coalesce(ct.credit_amount,0),0)
    - greatest(coalesce(ic.original_cogs,0) - coalesce(rc.returned_cogs,0),0))::numeric(14,2) as invoiced_gross_profit,
  case
    when greatest(i.total_amount - coalesce(ct.credit_amount,0),0) > 0 then
      least(i.paid_amount / greatest(i.total_amount - coalesce(ct.credit_amount,0),0),1)
      * (greatest(i.total_amount - coalesce(ct.credit_amount,0),0)
        - greatest(coalesce(ic.original_cogs,0) - coalesce(rc.returned_cogs,0),0))
    else 0
  end::numeric(14,2) as realized_gross_profit
from public.sales_invoices i
left join item_costs ic on ic.invoice_id = i.id
left join credit_totals ct on ct.invoice_id = i.id
left join return_costs rc on rc.invoice_id = i.id;

create view public.shop_outstanding_report with (security_invoker=true) as
select s.id as shop_id, s.shop_code, s.shop_name, s.default_currency,
  coalesce(sum(i.balance_amount) filter(where i.status not in ('draft','cancelled','paid')),0)::numeric(14,2) as outstanding_amount,
  count(i.id) filter(where i.status not in ('draft','cancelled','paid')) as open_invoices
from public.shops s left join public.sales_invoices i on i.shop_id = s.id
group by s.id;

grant select on public.sales_profit_report, public.shop_outstanding_report to authenticated;
grant select, insert, update, delete on public.stock_movements, public.sales_credit_notes, public.sales_credit_note_items to authenticated;
grant select, insert, update on public.message_threads, public.message_recipients, public.thread_messages to authenticated;

-- Backfill automatic accounting rows only where the LKR value is known.
-- Older EUR records did not store an exchange rate. A default rate of 1 would
-- silently create incorrect accounting, so those records must be reopened or
-- re-entered from the app with the real EUR -> LKR rate.
update public.sales_invoice_payments p
set amount = p.amount
from public.sales_invoices i
where i.id = p.invoice_id
  and (i.currency = 'LKR' or p.exchange_rate_lkr <> 1);

update public.payrolls
set status = status
where status = 'paid'
  and (currency = 'LKR' or exchange_rate_lkr <> 1);

update public.sales_credit_notes c
set status = c.status
from public.sales_invoices i
where i.id = c.invoice_id
  and c.status = 'refunded'
  and (i.currency = 'LKR' or c.refund_exchange_rate_lkr <> 1);

-- Recalculate existing invoice balances using payments and credit notes.
do $$ declare r record; begin
  for r in select id from public.sales_invoices loop
    perform public.recalculate_sales_invoice_financials(r.id);
  end loop;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Payment reversal helper (added in attendance/transaction stability update)
-- ---------------------------------------------------------------------------
create or replace function public.reverse_sales_invoice_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.sales_invoice_payments%rowtype;
  v_invoice public.sales_invoices%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can reverse invoice payments.';
  end if;

  select * into v_payment
  from public.sales_invoice_payments
  where id = p_payment_id
  for update;
  if not found then
    raise exception 'The linked payment could not be found. Refresh the page and try again.';
  end if;

  select * into v_invoice
  from public.sales_invoices
  where id = v_payment.invoice_id
  for update;
  if not found then raise exception 'The linked invoice could not be found.'; end if;

  delete from public.sales_invoice_payments where id = v_payment.id;
  update public.sales_invoices set invoice_pdf_path = null, updated_at = now() where id = v_invoice.id;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'invoice_id', v_invoice.id,
    'invoice_code', v_invoice.invoice_code,
    'receipt_pdf_path', v_payment.receipt_pdf_path,
    'invoice_pdf_path', v_invoice.invoice_pdf_path
  );
end;
$$;
revoke all on function public.reverse_sales_invoice_payment(uuid) from public;
grant execute on function public.reverse_sales_invoice_payment(uuid) to authenticated;
