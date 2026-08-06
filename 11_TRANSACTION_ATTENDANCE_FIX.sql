-- Aroma Ceylon V2
-- Transaction payment reversal + attendance selection stability patch
-- Safe to run more than once after 10_STABLE_COMPLETE_UPGRADE_PATCH.sql.

begin;

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

  select *
    into v_payment
    from public.sales_invoice_payments
   where id = p_payment_id
   for update;

  if not found then
    raise exception 'The linked payment could not be found. Refresh the page and try again.';
  end if;

  select *
    into v_invoice
    from public.sales_invoices
   where id = v_payment.invoice_id
   for update;

  if not found then
    raise exception 'The linked invoice could not be found.';
  end if;

  -- Existing validation prevents reversing money that has already been refunded.
  -- Existing payment triggers remove the generated income row and recalculate
  -- paid amount, outstanding balance and invoice status in the same transaction.
  delete from public.sales_invoice_payments
   where id = v_payment.id;

  -- Never leave a downloadable PDF showing the old payment totals.
  update public.sales_invoices
     set invoice_pdf_path = null,
         updated_at = now()
   where id = v_invoice.id;

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

comment on function public.reverse_sales_invoice_payment(uuid) is
  'Admin-only atomic reversal of a sales payment. Payment triggers remove linked income and recalculate invoice financials.';

commit;
