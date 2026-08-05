import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import type { AppLanguage } from './i18n'
import { t } from './i18n'
import { createCreditNotePdfBlob, createInvoicePdfBlob } from './lib/salesPdf'

type Product = {
  id: string
  name: string
  sku: string
  currency: string
  selling_price: number
  cost_price: number | null
  stock_quantity?: number
  reorder_level?: number
  active: boolean
}

type Invoice = {
  id: string
  invoice_code: string
  total_amount: number
  credited_amount?: number
  paid_amount: number
  balance_amount: number
  currency: string
  status: string
  invoice_date: string
  delivery_status: string
  shop_id: string
}

type InvoiceItem = {
  id: string
  invoice_id: string
  product_id: string | null
  product_name: string
  sku: string
  pack_size: string | null
  quantity: number
  unit_price: number
  cost_price?: number
  line_total: number
}

type Payment = {
  id: string
  invoice_id: string
  payment_date: string
  amount: number
}

type Shop = {
  id: string
  shop_name: string
  shop_code: string
  contact_person?: string | null
  phone?: string | null
  email?: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  city?: string | null
  postal_code?: string | null
  country?: string
  vat_number?: string | null
  preferred_language?: 'en' | 'si'
}

type Credit = {
  id: string
  credit_code: string
  invoice_id: string
  amount: number
  reason: string
  status: string
  created_at: string
  credit_pdf_path?: string | null
  restore_stock?: boolean
  refund_method?: string | null
  refund_reference?: string | null
}

type CreditItem = {
  id: string
  credit_note_id: string
  invoice_item_id: string
  product_id: string | null
  product_name: string
  sku: string
  pack_size: string | null
  quantity: number
  unit_price: number
  cost_price: number
  line_total: number
}

type ProfitRow = Invoice & {
  net_sales: number
  cost_of_goods: number
  invoiced_gross_profit: number
  realized_gross_profit: number
}

type StockMovement = {
  id: string
  product_id: string
  movement_type: string
  quantity: number
  balance_after: number
  reason: string | null
  created_at: string
}

type ReturnQuantityMap = Record<string, string>

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(Number(value || 0))
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`
  }
}

function localMonth() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 7)
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function OperationsHub({
  mode,
  products,
  shops,
  language,
  onChanged,
}: {
  mode: 'inventory' | 'reports'
  products: Product[]
  shops: Shop[]
  language: AppLanguage
  onChanged: () => void
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [profits, setProfits] = useState<ProfitRow[]>([])
  const [credits, setCredits] = useState<Credit[]>([])
  const [creditItems, setCreditItems] = useState<CreditItem[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [selectedMonth, setSelectedMonth] = useState(localMonth())

  const [productId, setProductId] = useState('')
  const [adjustment, setAdjustment] = useState('')
  const [reason, setReason] = useState('Stock count adjustment')

  const [invoiceId, setInvoiceId] = useState('')
  const [creditAmount, setCreditAmount] = useState('')
  const [creditReason, setCreditReason] = useState('Returned goods')
  const [returnQuantities, setReturnQuantities] = useState<ReturnQuantityMap>({})
  const [refundRate, setRefundRate] = useState('')
  const [refundMethod, setRefundMethod] = useState('Bank transfer')
  const [refundReference, setRefundReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [invoiceResult, itemResult, paymentResult, profitResult, creditResult, creditItemResult, movementResult] = await Promise.all([
      supabase.from('sales_invoices').select('id,invoice_code,total_amount,credited_amount,paid_amount,balance_amount,currency,status,invoice_date,delivery_status,shop_id').order('invoice_date', { ascending: false }),
      supabase.from('sales_invoice_items').select('id,invoice_id,product_id,product_name,sku,pack_size,quantity,unit_price,cost_price,line_total').order('sort_order'),
      supabase.from('sales_invoice_payments').select('id,invoice_id,payment_date,amount').order('payment_date', { ascending: false }),
      supabase.from('sales_profit_report').select('*'),
      supabase.from('sales_credit_notes').select('*').order('created_at', { ascending: false }),
      supabase.from('sales_credit_note_items').select('*'),
      supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(200),
    ])

    const firstError = invoiceResult.error || itemResult.error || paymentResult.error || profitResult.error || creditResult.error || creditItemResult.error || movementResult.error
    if (firstError) setError(firstError.message)
    if (!invoiceResult.error) setInvoices((invoiceResult.data || []) as Invoice[])
    if (!itemResult.error) setInvoiceItems((itemResult.data || []) as InvoiceItem[])
    if (!paymentResult.error) setPayments((paymentResult.data || []) as Payment[])
    if (!profitResult.error) setProfits((profitResult.data || []) as ProfitRow[])
    if (!creditResult.error) setCredits((creditResult.data || []) as Credit[])
    if (!creditItemResult.error) setCreditItems((creditItemResult.data || []) as CreditItem[])
    if (!movementResult.error) setMovements((movementResult.data || []) as StockMovement[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === invoiceId) || null,
    [invoices, invoiceId],
  )

  const selectedInvoiceItems = useMemo(
    () => invoiceItems.filter((item) => item.invoice_id === invoiceId),
    [invoiceItems, invoiceId],
  )

  const alreadyReturnedByItem = useMemo(() => {
    const validCreditIds = new Set(credits.filter((credit) => credit.status !== 'cancelled').map((credit) => credit.id))
    const grouped: Record<string, number> = {}
    creditItems.forEach((item) => {
      if (validCreditIds.has(item.credit_note_id)) grouped[item.invoice_item_id] = (grouped[item.invoice_item_id] || 0) + Number(item.quantity || 0)
    })
    return grouped
  }, [creditItems, credits])

  const lowStock = useMemo(
    () => products.filter((product) => product.active && Number(product.stock_quantity || 0) <= Number(product.reorder_level || 0)),
    [products],
  )

  const monthlyProfitRows = useMemo(
    () => profits.filter((row) => row.invoice_date?.slice(0, 7) === selectedMonth && !['draft', 'cancelled'].includes(row.status)),
    [profits, selectedMonth],
  )

  const monthlyPayments = useMemo(
    () => payments.filter((payment) => payment.payment_date?.slice(0, 7) === selectedMonth),
    [payments, selectedMonth],
  )

  const byCurrency = useMemo(() => {
    const result: Record<string, { sales: number; received: number; outstanding: number; gross: number; credits: number }> = {}
    const ensure = (currency: string) => result[currency] ||= { sales: 0, received: 0, outstanding: 0, gross: 0, credits: 0 }

    monthlyProfitRows.forEach((invoice) => {
      const row = ensure(invoice.currency)
      row.sales += Number(invoice.net_sales || 0)
      row.gross += Number(invoice.realized_gross_profit || 0)
    })
    monthlyPayments.forEach((payment) => {
      const invoice = invoices.find((candidate) => candidate.id === payment.invoice_id)
      if (invoice) ensure(invoice.currency).received += Number(payment.amount || 0)
    })
    invoices.filter((invoice) => !['draft', 'cancelled', 'paid'].includes(invoice.status)).forEach((invoice) => {
      ensure(invoice.currency).outstanding += Number(invoice.balance_amount || 0)
    })
    credits.filter((credit) => credit.status !== 'cancelled' && credit.created_at?.slice(0, 7) === selectedMonth).forEach((credit) => {
      const invoice = invoices.find((candidate) => candidate.id === credit.invoice_id)
      if (invoice) ensure(invoice.currency).credits += Number(credit.amount || 0)
    })
    return result
  }, [monthlyProfitRows, monthlyPayments, invoices, credits, selectedMonth])

  const inventoryCostByCurrency = useMemo(() => {
    const result: Record<string, number> = {}
    products.forEach((product) => {
      result[product.currency] = (result[product.currency] || 0) + Number(product.stock_quantity || 0) * Number(product.cost_price || 0)
    })
    return result
  }, [products])

  const bestSellingProducts = useMemo(() => {
    const monthInvoiceIds = new Set(invoices.filter((invoice) => invoice.invoice_date?.slice(0, 7) === selectedMonth && !['draft', 'cancelled'].includes(invoice.status)).map((invoice) => invoice.id))
    const validCreditIds = new Set(credits.filter((credit) => credit.status !== 'cancelled').map((credit) => credit.id))
    const returnedByInvoiceItem: Record<string, number> = {}
    creditItems.forEach((item) => {
      if (validCreditIds.has(item.credit_note_id)) returnedByInvoiceItem[item.invoice_item_id] = (returnedByInvoiceItem[item.invoice_item_id] || 0) + Number(item.quantity || 0)
    })

    const grouped: Record<string, { name: string; sku: string; quantity: number }> = {}
    invoiceItems.forEach((item) => {
      if (!monthInvoiceIds.has(item.invoice_id)) return
      const netQuantity = Math.max(Number(item.quantity || 0) - Number(returnedByInvoiceItem[item.id] || 0), 0)
      if (netQuantity <= 0) return
      const key = item.product_id || `${item.sku}-${item.product_name}`
      const row = grouped[key] ||= { name: item.product_name, sku: item.sku, quantity: 0 }
      row.quantity += netQuantity
    })
    return Object.values(grouped).sort((a, b) => b.quantity - a.quantity).slice(0, 10)
  }, [invoiceItems, invoices, selectedMonth, credits, creditItems])

  const outstandingByShop = useMemo(() => {
    const grouped: Record<string, Record<string, number>> = {}
    invoices.filter((invoice) => !['draft', 'cancelled', 'paid'].includes(invoice.status)).forEach((invoice) => {
      const shopGroup = grouped[invoice.shop_id] ||= {}
      shopGroup[invoice.currency] = (shopGroup[invoice.currency] || 0) + Number(invoice.balance_amount || 0)
    })
    return grouped
  }, [invoices])

  const refundableByInvoice = useMemo(() => {
    const refunded: Record<string, number> = {}
    credits.filter((credit) => credit.status === 'refunded').forEach((credit) => {
      refunded[credit.invoice_id] = (refunded[credit.invoice_id] || 0) + Number(credit.amount || 0)
    })
    const available: Record<string, number> = {}
    invoices.forEach((invoice) => {
      const adjustedTotal = Math.max(Number(invoice.total_amount || 0) - Number(invoice.credited_amount || 0), 0)
      available[invoice.id] = Math.max(Number(invoice.paid_amount || 0) - adjustedTotal - Number(refunded[invoice.id] || 0), 0)
    })
    return available
  }, [credits, invoices])

  async function refreshInvoicePdf(invoiceIdToRefresh: string) {
    const [invoiceResult, itemResult, paymentResult] = await Promise.all([
      supabase.from('sales_invoices').select('*').eq('id', invoiceIdToRefresh).single(),
      supabase.from('sales_invoice_items').select('*').eq('invoice_id', invoiceIdToRefresh).order('sort_order'),
      supabase.from('sales_invoice_payments').select('*').eq('invoice_id', invoiceIdToRefresh).order('payment_date', { ascending: false }),
    ])
    if (invoiceResult.error || itemResult.error || paymentResult.error) {
      throw new Error(invoiceResult.error?.message || itemResult.error?.message || paymentResult.error?.message || 'Unable to refresh invoice PDF.')
    }
    const invoice = invoiceResult.data as Invoice & Record<string, unknown>
    const shop = shops.find((candidate) => candidate.id === invoice.shop_id)
    if (!shop) throw new Error('Invoice shop is unavailable.')
    const blob = await createInvoicePdfBlob(
      invoice as never,
      { ...shop, country: shop.country || '' } as never,
      (itemResult.data || []) as never,
      (paymentResult.data || []) as never,
      'Aroma Ceylon Administrator',
    )
    const path = `${invoiceIdToRefresh}/invoice-${invoice.invoice_code}.pdf`
    const { error: uploadError } = await supabase.storage.from('sales-documents').upload(path, blob, { contentType: 'application/pdf', upsert: true })
    if (uploadError) throw uploadError
    const { error: updateError } = await supabase.from('sales_invoices').update({ invoice_pdf_path: path }).eq('id', invoiceIdToRefresh)
    if (updateError) throw updateError
  }

  async function adjustStock(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    const quantity = Number(adjustment)
    if (!productId || !Number.isFinite(quantity) || quantity === 0) {
      setError('Select a product and enter a non-zero adjustment.')
      return
    }
    if (!reason.trim()) {
      setError('Enter the reason for this stock adjustment.')
      return
    }
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('adjust_product_stock', {
      p_product_id: productId,
      p_quantity: quantity,
      p_reason: reason.trim(),
    })
    if (rpcError) setError(rpcError.message)
    else {
      setNotice('Stock updated and the movement was recorded.')
      setAdjustment('')
      await load()
      onChanged()
    }
    setBusy(false)
  }

  async function createOrRefreshCreditPdf(credit: Credit) {
    const invoice = invoices.find((candidate) => candidate.id === credit.invoice_id)
    if (!invoice) throw new Error('Credit-note invoice is unavailable.')
    const shop = shops.find((candidate) => candidate.id === invoice.shop_id)
    if (!shop) throw new Error('Credit-note shop is unavailable.')
    const createdItems = creditItems.filter((item) => item.credit_note_id === credit.id)
    const blob = await createCreditNotePdfBlob(credit, invoice, shop, createdItems)
    const path = `credits/${credit.id}/${credit.credit_code}.pdf`
    const { error: uploadError } = await supabase.storage.from('sales-documents').upload(path, blob, { contentType: 'application/pdf', upsert: true })
    if (uploadError) throw uploadError
    const { error: pathError } = await supabase.from('sales_credit_notes').update({ credit_pdf_path: path }).eq('id', credit.id)
    if (pathError) throw pathError
    return path
  }

  async function regenerateCreditPdf(credit: Credit) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await createOrRefreshCreditPdf(credit)
      setNotice('Credit note PDF created.')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create the credit note PDF.')
    } finally {
      setBusy(false)
    }
  }

  async function issueCredit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    let createdCreditId: string | null = null
    try {
      const amount = Number(creditAmount)
      if (!selectedInvoice || amount <= 0) throw new Error('Select an invoice and enter a valid credit amount.')
      const availableCredit = Math.max(Number(selectedInvoice.total_amount) - Number(selectedInvoice.credited_amount || 0), 0)
      if (amount > availableCredit + 0.01) throw new Error(`The maximum available credit is ${money(availableCredit, selectedInvoice.currency)}.`)

      const returnItems = selectedInvoiceItems.map((item) => ({
        invoice_item_id: item.id,
        quantity: Number(returnQuantities[item.id] || 0),
      })).filter((item) => item.quantity > 0)

      for (const returned of returnItems) {
        const invoiceItem = selectedInvoiceItems.find((item) => item.id === returned.invoice_item_id)
        const available = Number(invoiceItem?.quantity || 0) - Number(alreadyReturnedByItem[returned.invoice_item_id] || 0)
        if (returned.quantity > available + 0.0005) throw new Error(`Return quantity is too high for ${invoiceItem?.product_name || 'the selected item'}.`)
      }

      const { data: creditId, error: rpcError } = await supabase.rpc('issue_sales_credit_note_v2', {
        p_invoice_id: selectedInvoice.id,
        p_amount: amount,
        p_reason: creditReason.trim(),
        p_return_items: returnItems,
      })
      if (rpcError) throw rpcError
      if (!creditId) throw new Error('The credit note was created without a reference ID.')
      createdCreditId = String(creditId)

      const [creditResult, creditItemsResult] = await Promise.all([
        supabase.from('sales_credit_notes').select('*').eq('id', createdCreditId).single(),
        supabase.from('sales_credit_note_items').select('*').eq('credit_note_id', createdCreditId),
      ])
      if (creditResult.error) throw creditResult.error
      if (creditItemsResult.error) throw creditItemsResult.error

      const credit = creditResult.data as Credit
      const createdItems = (creditItemsResult.data || []) as CreditItem[]
      const invoice = selectedInvoice
      const shop = shops.find((candidate) => candidate.id === invoice.shop_id)
      const documentWarnings: string[] = []
      if (shop) {
        try {
          const blob = await createCreditNotePdfBlob(credit, invoice, shop, createdItems)
          const path = `credits/${createdCreditId}/${credit.credit_code}.pdf`
          const { error: uploadError } = await supabase.storage.from('sales-documents').upload(path, blob, { contentType: 'application/pdf', upsert: true })
          if (uploadError) throw uploadError
          const { error: pathError } = await supabase.from('sales_credit_notes').update({ credit_pdf_path: path }).eq('id', createdCreditId)
          if (pathError) throw pathError
        } catch (caught) {
          documentWarnings.push(caught instanceof Error ? caught.message : 'Credit note PDF failed.')
        }
      } else {
        documentWarnings.push('Credit-note shop is unavailable.')
      }
      try {
        await refreshInvoicePdf(invoice.id)
      } catch (caught) {
        documentWarnings.push(caught instanceof Error ? caught.message : 'Invoice PDF refresh failed.')
      }

      setNotice('Credit note issued. Invoice balance and returned stock were updated.')
      if (documentWarnings.length) setError(`The credit note was saved, but a PDF needs to be recreated: ${documentWarnings.join(' · ')}`)
      setCreditAmount('')
      setReturnQuantities({})
      await load()
      onChanged()
    } catch (caught) {
      if (createdCreditId) {
        setError(`Credit note ${createdCreditId} was saved, but document generation did not finish. Do not create it again; use Create PDF in the credit list.`)
        await load()
        onChanged()
      } else {
        setError(caught instanceof Error ? caught.message : 'Unable to issue the credit note.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function markRefunded(credit: Credit) {
    const invoice = invoices.find((candidate) => candidate.id === credit.invoice_id)
    if (!invoice) return
    const available = Number(refundableByInvoice[invoice.id] || 0)
    if (Number(credit.amount) > available + 0.01) {
      setError(`Only ${money(available, invoice.currency)} is currently available for a cash refund. The remaining credit reduces the unpaid balance.`)
      return
    }
    if (invoice.currency === 'EUR' && Number(refundRate) <= 0) {
      setError('Enter the EUR to LKR exchange rate before recording the refund.')
      return
    }
    if (!window.confirm(`Mark ${credit.credit_code} as refunded?`)) return
    setBusy(true)
    setError('')
    setNotice('')
    let refundSaved = false
    try {
      const { error: rpcError } = await supabase.rpc('mark_sales_credit_refunded', {
        p_credit_id: credit.id,
        p_method: refundMethod,
        p_reference: refundReference.trim() || null,
        p_exchange_rate_lkr: invoice.currency === 'EUR' ? Number(refundRate) : 1,
      })
      if (rpcError) throw rpcError
      refundSaved = true
      try {
        await refreshInvoicePdf(invoice.id)
      } catch (caught) {
        setError(`Refund was recorded, but the invoice PDF needs a refresh: ${caught instanceof Error ? caught.message : 'PDF refresh failed.'}`)
      }
      setNotice('Refund recorded and added to approved expenses automatically.')
      setRefundRate('')
      setRefundReference('')
      await load()
      onChanged()
    } catch (caught) {
      setError(refundSaved ? 'Refund was recorded, but the screen could not fully refresh.' : (caught instanceof Error ? caught.message : 'Unable to record the refund.'))
      if (refundSaved) {
        await load()
        onChanged()
      }
    } finally {
      setBusy(false)
    }
  }

  async function cancelCredit(credit: Credit) {
    if (!window.confirm(`Cancel ${credit.credit_code}? Any returned stock will be reversed.`)) return
    setBusy(true)
    setError('')
    setNotice('')
    let cancellationSaved = false
    try {
      const { error: rpcError } = await supabase.rpc('cancel_sales_credit_note', { p_credit_id: credit.id })
      if (rpcError) throw rpcError
      cancellationSaved = true
      try {
        await refreshInvoicePdf(credit.invoice_id)
      } catch (caught) {
        setError(`Credit note was cancelled, but the invoice PDF needs a refresh: ${caught instanceof Error ? caught.message : 'PDF refresh failed.'}`)
      }
      setNotice('Credit note cancelled and related stock/balance changes were reversed.')
      await load()
      onChanged()
    } catch (caught) {
      setError(cancellationSaved ? 'Credit note was cancelled, but the screen could not fully refresh.' : (caught instanceof Error ? caught.message : 'Unable to cancel the credit note.'))
      if (cancellationSaved) {
        await load()
        onChanged()
      }
    } finally {
      setBusy(false)
    }
  }

  async function download(path: string, name: string) {
    const { data, error: signedError } = await supabase.storage.from('sales-documents').createSignedUrl(path, 120, { download: name })
    if (signedError) setError(signedError.message)
    else {
      const anchor = document.createElement('a')
      anchor.href = data.signedUrl
      anchor.download = name
      anchor.rel = 'noopener'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    }
  }

  if (mode === 'inventory') {
    return (
      <div className="stacked-sections">
        <section className="content-card">
          <div className="card-title-row">
            <div><p className="eyebrow">INVENTORY CONTROL</p><h2>{t('Inventory', language)}</h2><p className="section-copy">Delivery and return changes are recorded automatically. Use adjustments only for stock counts, damages or corrections.</p></div>
            <span className="status-pill">{lowStock.length} {t('Low stock', language)}</span>
          </div>
          <div className="inventory-grid">
            {products.map((product) => {
              const isLow = Number(product.stock_quantity || 0) <= Number(product.reorder_level || 0)
              return <article className={`inventory-card ${isLow ? 'low' : ''}`} key={product.id}>
                <span>{product.sku}</span><strong>{product.name}</strong><b>{Number(product.stock_quantity || 0).toFixed(3)}</b>
                <small>{t('Reorder level', language)}: {Number(product.reorder_level || 0).toFixed(3)}</small>
                {isLow && <em>{t('Low stock', language)}</em>}
              </article>
            })}
          </div>
        </section>

        <section className="content-card form-card">
          <h2>{t('Stock adjustment', language)}</h2>
          <form className="compact-form" onSubmit={adjustStock}>
            <label>{t('Products', language)}<select value={productId} onChange={(event) => setProductId(event.target.value)} required><option value="">Select product</option>{products.filter((product) => product.active).map((product) => <option value={product.id} key={product.id}>{product.name} ({product.sku}) · {Number(product.stock_quantity || 0).toFixed(3)}</option>)}</select></label>
            <label>Quantity (+ / −)<input type="number" step="0.001" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} required /></label>
            <label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} required /></label>
            <button className="primary-button" disabled={busy}>{busy ? 'Saving…' : t('Save', language)}</button>
          </form>
          {notice && <p className="form-message">{notice}</p>}
          {error && <p className="form-error">{error}</p>}
        </section>

        <section className="content-card">
          <div className="card-title-row"><div><p className="eyebrow">AUDIT TRAIL</p><h2>Recent stock movements</h2></div><span className="count-pill">{movements.length}</span></div>
          {loading ? <p className="section-copy">Loading…</p> : movements.length === 0 ? <div className="empty-state">No stock movements yet.</div> : <div className="movement-list">
            {movements.map((movement) => {
              const product = products.find((candidate) => candidate.id === movement.product_id)
              return <div className="movement-row" key={movement.id}><span><strong>{product?.name || 'Product'}</strong><small>{movement.movement_type} · {movement.reason || 'No note'} · {dateTime(movement.created_at)}</small></span><b className={Number(movement.quantity) >= 0 ? 'positive' : 'negative'}>{Number(movement.quantity) >= 0 ? '+' : ''}{Number(movement.quantity).toFixed(3)}</b><em>Balance {Number(movement.balance_after).toFixed(3)}</em></div>
            })}
          </div>}
        </section>
      </div>
    )
  }

  return (
    <div className="stacked-sections">
      <section className="content-card">
        <div className="card-title-row"><div><p className="eyebrow">BUSINESS REPORTS</p><h2>{t('Reports', language)}</h2><p className="section-copy">Sales and received payments use the selected month. Outstanding totals show the current open balance.</p></div><label className="month-filter">Month<input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} /></label></div>
        {Object.keys(byCurrency).length === 0 ? <div className="empty-state">No report data for this month.</div> : Object.entries(byCurrency).map(([currency, row]) => <div className="finance-grid" key={currency}>
          <article className="finance-card income-card"><span>{t('Monthly sales', language)} ({currency})</span><strong>{money(row.sales, currency)}</strong></article>
          <article className="finance-card net-card"><span>Payments received</span><strong>{money(row.received, currency)}</strong></article>
          <article className="finance-card pending-card"><span>{t('Outstanding invoices', language)}</span><strong>{money(row.outstanding, currency)}</strong></article>
          <article className="finance-card expense-card"><span>Credit notes</span><strong>{money(row.credits, currency)}</strong></article>
          <article className="finance-card"><span>Realized gross profit</span><strong>{money(row.gross, currency)}</strong></article>
        </div>)}

        <div className="finance-grid">
          {Object.entries(inventoryCostByCurrency).map(([currency, value]) => <article className="finance-card" key={currency}><span>Inventory cost value ({currency})</span><strong>{money(value, currency)}</strong></article>)}
          <article className="finance-card pending-card"><span>{t('Low stock', language)}</span><strong>{lowStock.length}</strong></article>
        </div>

        <div className="reports-two-column">
          <div className="report-table"><h3>Outstanding by shop</h3>{shops.flatMap((shop) => Object.entries(outstandingByShop[shop.id] || {}).filter(([, amount]) => amount > 0).map(([currency, amount]) => <div key={`${shop.id}-${currency}`}><span>{shop.shop_name}</span><strong>{money(amount, currency)}</strong></div>))}</div>
          <div className="report-table"><h3>Best-selling products</h3>{bestSellingProducts.length === 0 ? <p className="section-copy">No finalized sales this month.</p> : bestSellingProducts.map((product) => <div key={`${product.sku}-${product.name}`}><span>{product.name}<small>{product.sku}</small></span><strong>{product.quantity.toFixed(3)}</strong></div>)}</div>
        </div>
      </section>

      <section className="content-card form-card">
        <div className="card-title-row"><div><p className="eyebrow">RETURNS & REFUNDS</p><h2>{t('Credit note', language)} / {t('Refund', language)}</h2><p className="section-copy">A credit note reduces the invoice balance. Returned quantities restore only the selected stock.</p></div></div>
        <form className="compact-form credit-form" onSubmit={issueCredit}>
          <label>Invoice<select value={invoiceId} onChange={(event) => { setInvoiceId(event.target.value); setReturnQuantities({}); setCreditAmount('') }} required><option value="">Select invoice</option>{invoices.filter((invoice) => !['draft', 'cancelled'].includes(invoice.status) && Number(invoice.total_amount) - Number(invoice.credited_amount || 0) > 0.01).map((invoice) => <option value={invoice.id} key={invoice.id}>{invoice.invoice_code} · {money(Number(invoice.total_amount) - Number(invoice.credited_amount || 0), invoice.currency)} available</option>)}</select></label>
          <label>Credit amount<input type="number" min="0.01" step="0.01" value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} required /></label>
          <label>Reason<input value={creditReason} onChange={(event) => setCreditReason(event.target.value)} required /></label>

          {selectedInvoice?.delivery_status === 'delivered' && selectedInvoiceItems.length > 0 && <div className="credit-return-items"><h3>Returned products (optional)</h3><p className="section-copy">Enter only the quantities physically returned.</p>{selectedInvoiceItems.map((item) => {
            const available = Math.max(Number(item.quantity) - Number(alreadyReturnedByItem[item.id] || 0), 0)
            return <label className="credit-return-row" key={item.id}><span><strong>{item.product_name}</strong><small>{item.sku} · Available {available.toFixed(3)}</small></span><input type="number" min="0" max={available} step="0.001" value={returnQuantities[item.id] || ''} onChange={(event) => setReturnQuantities((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="0" /></label>
          })}</div>}
          <button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Issue credit note & PDF'}</button>
        </form>

        <div className="compact-form refund-controls">
          <label>Refund method<select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)}><option>Cash</option><option>Bank transfer</option><option>Card</option><option>Other</option></select></label>
          <label>Refund reference<input value={refundReference} onChange={(event) => setRefundReference(event.target.value)} /></label>
          <label>EUR → LKR rate<input type="number" min="0" step="0.0001" value={refundRate} onChange={(event) => setRefundRate(event.target.value)} /></label>
        </div>

        <div className="credit-list">
          {credits.map((credit) => {
            const invoice = invoices.find((candidate) => candidate.id === credit.invoice_id)
            const returnedItems = creditItems.filter((item) => item.credit_note_id === credit.id)
            const refundable = invoice ? Number(refundableByInvoice[invoice.id] || 0) : 0
            const canRefund = credit.status === 'issued' && Number(credit.amount) <= refundable + 0.01
            return <article className="credit-card" key={credit.id}>
              <div>
                <span className="product-sku">{credit.credit_code}</span>
                <h3>{invoice?.invoice_code || 'Invoice'} · {credit.reason}</h3>
                <p>{money(credit.amount, invoice?.currency || 'EUR')} · <strong>{credit.status}</strong>{returnedItems.length > 0 ? ` · ${returnedItems.length} returned item(s)` : ''}</p>
                {credit.status === 'issued' && invoice && <small>{t('Available to refund', language)}: {money(refundable, invoice.currency)}{!canRefund ? ` · ${t('No refundable amount', language)}` : ''}</small>}
              </div>
              <div className="credit-actions">
                {credit.credit_pdf_path ? <button className="small-button" type="button" onClick={() => download(credit.credit_pdf_path as string, `${credit.credit_code}.pdf`)}>PDF</button> : <button className="small-button" type="button" disabled={busy} onClick={() => regenerateCreditPdf(credit)}>Create PDF</button>}
                {canRefund && <button className="success-button small-button" type="button" disabled={busy} onClick={() => markRefunded(credit)}>Mark refunded</button>}
                {credit.status === 'issued' && <button className="delete-button" type="button" disabled={busy} onClick={() => cancelCredit(credit)}>Cancel credit</button>}
              </div>
            </article>
          })}
        </div>
        {notice && <p className="form-message">{notice}</p>}
        {error && <p className="form-error">{error}</p>}
      </section>
    </div>
  )
}
