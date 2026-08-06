-- Aroma Ceylon V2
-- Test invoice cleanup + real invoice voiding patch
-- Safe to run after 11_TRANSACTION_ATTENDANCE_FIX.sql.

begin;

alter table public.sales_invoices
  add column if not exists is_test boolean not null default false,
  add column if not exists marked_test_at timestamptz,
  add column if not exists marked_test_by uuid references public.profiles(id) on delete set null,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id) on delete set null,
  add column if not exists void_reason text;

create index if not exists sales_invoices_test_status_idx
  on public.sales_invoices (is_test, status, invoice_date desc);

-- Test invoices and void invoices must never create cash-income rows.
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
  if not found then return new; end if;

  if v_invoice.is_test or v_invoice.status = 'cancelled' then
    delete from public.income where source_type = 'sales_payment' and source_id = new.id;
    return new;
  end if;

  select shop_name into v_shop_name from public.shops where id = v_invoice.shop_id;
  if v_invoice.currency = 'EUR' then
    v_amount_for_generated_lkr := new.amount;
    v_rate := new.exchange_rate_lkr;
  else
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

-- Refund expenses from test/void invoices are excluded from cash profit too.
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

  select * into v_invoice from public.sales_invoices where id = new.invoice_id;
  if not found or v_invoice.is_test or v_invoice.status = 'cancelled' then
    delete from public.expenses where source_type = 'sales_refund' and source_id = new.id;
    return new;
  end if;

  if new.status = 'refunded' then
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

-- Permit the dedicated void RPC to move a delivered invoice to cancelled after
-- it has already reversed the exact recorded inventory effect.
create or replace function public.apply_delivered_invoice_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_balance numeric(14,3);
begin
  if new.delivery_status = 'delivered' and old.delivery_status is distinct from 'delivered' then
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

    perform set_config('aroma.allow_stock_change', 'on', true);
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
    if coalesce(current_setting('aroma.allow_invoice_void', true), 'off') <> 'on' then
      raise exception 'A delivered invoice cannot be moved back. Use a credit note / return.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.reverse_sales_invoice_stock_effect(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_delta numeric(14,3);
  v_balance numeric(14,3);
begin
  perform set_config('aroma.allow_stock_change', 'on', true);

  for r in
    select product_id, round(coalesce(sum(quantity),0),3) as net_quantity
    from public.stock_movements
    where invoice_id = p_invoice_id
    group by product_id
    having abs(coalesce(sum(quantity),0)) > 0.0005
  loop
    v_delta := round(-r.net_quantity, 3);
    update public.products
       set stock_quantity = round(stock_quantity + v_delta, 3)
     where id = r.product_id
       and track_inventory = true
       and stock_quantity + v_delta >= -0.0005
     returning greatest(stock_quantity,0) into v_balance;

    if not found then
      raise exception 'Inventory cannot be reversed for one or more products. Check whether returned test stock has already been used.';
    end if;

    update public.products set stock_quantity = greatest(stock_quantity,0) where id = r.product_id;
    insert into public.stock_movements(
      product_id, movement_type, quantity, balance_after, reason, invoice_id, created_by
    ) values (
      r.product_id, 'correction', v_delta, greatest(v_balance,0), p_reason, p_invoice_id, auth.uid()
    );
  end loop;
end;
$$;
revoke all on function public.reverse_sales_invoice_stock_effect(uuid,text) from public;

create or replace function public.set_sales_invoice_test(p_invoice_id uuid, p_is_test boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.sales_invoices%rowtype;
  v_paths jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then raise exception 'Only administrators can change test-invoice mode.'; end if;

  select * into v_invoice from public.sales_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.'; end if;
  if v_invoice.status = 'cancelled' then raise exception 'A void invoice cannot be changed.'; end if;

  if not p_is_test then
    if v_invoice.status <> 'draft'
      or v_invoice.delivery_status = 'delivered'
      or exists(select 1 from public.sales_invoice_payments where invoice_id = p_invoice_id)
      or exists(select 1 from public.sales_credit_notes where invoice_id = p_invoice_id) then
      raise exception 'Only an unused draft can be changed back to a real invoice.';
    end if;
  end if;

  if p_is_test then
    select coalesce(jsonb_agg(path), '[]'::jsonb) into v_paths
    from (
      select v_invoice.invoice_pdf_path as path where v_invoice.invoice_pdf_path is not null
      union all select v_invoice.delivery_pdf_path where v_invoice.delivery_pdf_path is not null
      union all select receipt_pdf_path from public.sales_invoice_payments where invoice_id = p_invoice_id and receipt_pdf_path is not null
      union all select credit_pdf_path from public.sales_credit_notes where invoice_id = p_invoice_id and credit_pdf_path is not null
    ) documents;
  end if;

  update public.sales_invoices
     set is_test = p_is_test,
         marked_test_at = case when p_is_test then coalesce(marked_test_at, now()) else null end,
         marked_test_by = case when p_is_test then auth.uid() else null end,
         invoice_pdf_path = case when p_is_test then null else invoice_pdf_path end,
         delivery_pdf_path = case when p_is_test then null else delivery_pdf_path end
   where id = p_invoice_id;

  -- Touch source rows so their accounting triggers immediately add/remove the
  -- linked dashboard income/refund expense according to the new test flag.
  update public.sales_invoice_payments
     set amount = amount,
         receipt_pdf_path = case when p_is_test then null else receipt_pdf_path end
   where invoice_id = p_invoice_id;
  update public.sales_credit_notes
     set amount = amount,
         credit_pdf_path = case when p_is_test then null else credit_pdf_path end
   where invoice_id = p_invoice_id;

  return jsonb_build_object(
    'invoice_id', p_invoice_id,
    'invoice_code', v_invoice.invoice_code,
    'is_test', p_is_test,
    'document_paths', v_paths
  );
end;
$$;
revoke all on function public.set_sales_invoice_test(uuid,boolean) from public;
grant execute on function public.set_sales_invoice_test(uuid,boolean) to authenticated;

create or replace function public.delete_test_sales_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.sales_invoices%rowtype;
  v_paths jsonb;
begin
  if not public.is_admin() then raise exception 'Only administrators can delete test invoices.'; end if;

  select * into v_invoice from public.sales_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.'; end if;
  if not v_invoice.is_test then raise exception 'Only invoices marked as test can be permanently deleted.'; end if;

  select coalesce(jsonb_agg(path), '[]'::jsonb) into v_paths
  from (
    select v_invoice.invoice_pdf_path as path where v_invoice.invoice_pdf_path is not null
    union all select v_invoice.delivery_pdf_path where v_invoice.delivery_pdf_path is not null
    union all select receipt_pdf_path from public.sales_invoice_payments where invoice_id = p_invoice_id and receipt_pdf_path is not null
    union all select credit_pdf_path from public.sales_credit_notes where invoice_id = p_invoice_id and credit_pdf_path is not null
  ) documents;

  perform public.reverse_sales_invoice_stock_effect(p_invoice_id, 'Deleted test invoice ' || v_invoice.invoice_code);

  delete from public.sales_credit_notes where invoice_id = p_invoice_id;
  delete from public.sales_invoice_payments where invoice_id = p_invoice_id;
  delete from public.sales_invoices where id = p_invoice_id;

  return jsonb_build_object(
    'invoice_id', p_invoice_id,
    'invoice_code', v_invoice.invoice_code,
    'document_paths', v_paths
  );
end;
$$;
revoke all on function public.delete_test_sales_invoice(uuid) from public;
grant execute on function public.delete_test_sales_invoice(uuid) to authenticated;

create or replace function public.void_sales_invoice(p_invoice_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.sales_invoices%rowtype;
  v_paths jsonb;
begin
  if not public.is_admin() then raise exception 'Only administrators can void invoices.'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Enter a clear reason for voiding the invoice.'; end if;

  select * into v_invoice from public.sales_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.'; end if;
  if v_invoice.is_test then raise exception 'Use Delete test invoice for a test record.'; end if;
  if v_invoice.status = 'draft' then raise exception 'Delete the draft instead of voiding it.'; end if;
  if v_invoice.status = 'cancelled' then raise exception 'This invoice is already void.'; end if;

  select coalesce(jsonb_agg(path), '[]'::jsonb) into v_paths
  from (
    select v_invoice.invoice_pdf_path as path where v_invoice.invoice_pdf_path is not null
    union all select v_invoice.delivery_pdf_path where v_invoice.delivery_pdf_path is not null
    union all select receipt_pdf_path from public.sales_invoice_payments where invoice_id = p_invoice_id and receipt_pdf_path is not null
    union all select credit_pdf_path from public.sales_credit_notes where invoice_id = p_invoice_id and credit_pdf_path is not null
  ) documents;

  perform public.reverse_sales_invoice_stock_effect(p_invoice_id, 'Voided invoice ' || v_invoice.invoice_code);

  update public.sales_credit_notes
     set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), credit_pdf_path = null
   where invoice_id = p_invoice_id and status <> 'cancelled';

  delete from public.sales_invoice_payments where invoice_id = p_invoice_id;

  perform set_config('aroma.allow_invoice_void', 'on', true);
  update public.sales_invoices
     set status = 'cancelled',
         delivery_status = 'cancelled',
         paid_amount = 0,
         credited_amount = 0,
         balance_amount = 0,
         invoice_pdf_path = null,
         delivery_pdf_path = null,
         voided_at = now(),
         voided_by = auth.uid(),
         void_reason = trim(p_reason)
   where id = p_invoice_id;

  return jsonb_build_object(
    'invoice_id', p_invoice_id,
    'invoice_code', v_invoice.invoice_code,
    'document_paths', v_paths
  );
end;
$$;
revoke all on function public.void_sales_invoice(uuid,text) from public;
grant execute on function public.void_sales_invoice(uuid,text) to authenticated;

-- Do not waste refresh work on test or void records.
create or replace function public.refresh_sales_invoice_statuses()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare r record; v_count integer := 0;
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  for r in select id from public.sales_invoices where status not in ('draft','cancelled') and is_test = false loop
    perform public.recalculate_sales_invoice_financials(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Reports only contain genuine, non-void business invoices.
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
left join return_costs rc on rc.invoice_id = i.id
where i.is_test = false and i.status not in ('draft','cancelled');

create view public.shop_outstanding_report with (security_invoker=true) as
select s.id as shop_id, s.shop_code, s.shop_name, s.default_currency,
  coalesce(sum(i.balance_amount) filter(where i.is_test = false and i.status not in ('draft','cancelled','paid')),0)::numeric(14,2) as outstanding_amount,
  count(i.id) filter(where i.is_test = false and i.status not in ('draft','cancelled','paid')) as open_invoices
from public.shops s left join public.sales_invoices i on i.shop_id = s.id
group by s.id;

grant select on public.sales_profit_report, public.shop_outstanding_report to authenticated;

commit;
