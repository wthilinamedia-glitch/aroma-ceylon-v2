import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import type { AppLanguage } from './i18n'
import { t } from './i18n'
import { createCreditNotePdfBlob } from './lib/salesPdf'

type Product = { id: string; name: string; sku: string; currency: string; selling_price: number; cost_price: number | null; stock_quantity?: number; reorder_level?: number; active: boolean }
type Invoice = { id: string; invoice_code: string; total_amount: number; paid_amount: number; balance_amount: number; currency: string; status: string; invoice_date: string; shop_id: string }
type Shop = { id: string; shop_name: string; shop_code?: string; preferred_language?: 'en' | 'si' }
type Credit = { id: string; credit_code: string; invoice_id: string; amount: number; reason: string; status: string; created_at: string; credit_pdf_path?: string | null; restore_stock?: boolean }
type ProfitRow = Invoice & { cost_of_goods: number; invoiced_gross_profit: number; realized_gross_profit: number }

function money(value: number, currency: string) { return `${currency} ${Number(value || 0).toFixed(2)}` }

export function OperationsHub({ mode, products, shops, language, onChanged }: { mode: 'inventory' | 'reports'; products: Product[]; shops: Shop[]; language: AppLanguage; onChanged: () => void }) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [profits, setProfits] = useState<ProfitRow[]>([])
  const [credits, setCredits] = useState<Credit[]>([])
  const [productId, setProductId] = useState('')
  const [adjustment, setAdjustment] = useState('')
  const [reason, setReason] = useState('Stock count adjustment')
  const [invoiceId, setInvoiceId] = useState('')
  const [creditAmount, setCreditAmount] = useState('')
  const [creditReason, setCreditReason] = useState('Returned goods')
  const [restoreStock, setRestoreStock] = useState(false)
  const [refundRate, setRefundRate] = useState('')
  const [refundMethod, setRefundMethod] = useState('Bank transfer')
  const [refundReference, setRefundReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [invoiceResult, profitResult, creditResult] = await Promise.all([
      supabase.from('sales_invoices').select('id,invoice_code,total_amount,paid_amount,balance_amount,currency,status,invoice_date,shop_id'),
      supabase.from('sales_profit_report').select('*'),
      supabase.from('sales_credit_notes').select('*').order('created_at', { ascending: false }),
    ])
    if (!invoiceResult.error) setInvoices((invoiceResult.data || []) as Invoice[])
    if (!profitResult.error) setProfits((profitResult.data || []) as ProfitRow[])
    if (!creditResult.error) setCredits((creditResult.data || []) as Credit[])
  }, [])
  useEffect(() => { load() }, [load])

  const byCurrency = useMemo(() => {
    const result: Record<string, { sales: number; received: number; outstanding: number; gross: number; credits: number }> = {}
    const ensure = (currency: string) => result[currency] ||= { sales: 0, received: 0, outstanding: 0, gross: 0, credits: 0 }
    profits.filter((i) => !['draft', 'cancelled'].includes(i.status)).forEach((i) => { const row = ensure(i.currency); row.sales += Number(i.total_amount); row.received += Number(i.paid_amount); row.outstanding += Number(i.balance_amount); row.gross += Number(i.realized_gross_profit) })
    credits.filter((c) => c.status !== 'cancelled').forEach((c) => { const invoice = invoices.find((i) => i.id === c.invoice_id); if (invoice) ensure(invoice.currency).credits += Number(c.amount) })
    return result
  }, [profits, credits, invoices])

  const stockCost = useMemo(() => products.reduce((s, p) => s + Number(p.stock_quantity || 0) * Number(p.cost_price || 0), 0), [products])
  const lowStock = products.filter((p) => Number(p.stock_quantity || 0) <= Number(p.reorder_level || 0))

  async function adjustStock(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('')
    const qty = Number(adjustment)
    if (!productId || !Number.isFinite(qty) || qty === 0) return setError('Select a product and enter a non-zero adjustment.')
    const { error: rpcError } = await supabase.rpc('adjust_product_stock', { p_product_id: productId, p_quantity: qty, p_reason: reason })
    if (rpcError) setError(rpcError.message); else { setNotice('Stock updated.'); setAdjustment(''); onChanged() }
  }

  async function issueCredit(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true)
    try {
      const amount = Number(creditAmount)
      if (!invoiceId || amount <= 0) throw new Error('Select an invoice and enter a valid amount.')
      const { data: creditId, error: rpcError } = await supabase.rpc('issue_sales_credit_note', { p_invoice_id: invoiceId, p_amount: amount, p_reason: creditReason, p_restore_stock: restoreStock })
      if (rpcError) throw rpcError
      const invoice = invoices.find((i) => i.id === invoiceId); const shop = shops.find((s) => s.id === invoice?.shop_id)
      if (invoice && shop && creditId) {
        const blob = await createCreditNotePdfBlob({ credit_code: 'CREDIT NOTE', amount, reason: creditReason, status: 'issued', created_at: new Date().toISOString() }, invoice, shop)
        const path = `credits/${creditId}.pdf`
        const { error: uploadError } = await supabase.storage.from('sales-documents').upload(path, blob, { contentType: 'application/pdf', upsert: true })
        if (uploadError) throw uploadError
        await supabase.from('sales_credit_notes').update({ credit_pdf_path: path }).eq('id', creditId)
      }
      setNotice('Credit note issued and PDF created.'); setCreditAmount(''); setRestoreStock(false); await load(); onChanged()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to issue credit note.') }
    setBusy(false)
  }

  async function markRefunded(credit: Credit) {
    const invoice = invoices.find((i) => i.id === credit.invoice_id)
    if (!invoice) return
    if (invoice.currency === 'EUR' && Number(refundRate) <= 0) return setError('Enter the EUR to LKR exchange rate before recording the refund.')
    setBusy(true); setError('')
    const { error: rpcError } = await supabase.rpc('mark_sales_credit_refunded', { p_credit_id: credit.id, p_method: refundMethod, p_reference: refundReference || null, p_exchange_rate_lkr: invoice.currency === 'EUR' ? Number(refundRate) : 1 })
    if (rpcError) setError(rpcError.message); else { setNotice('Refund recorded and profit updated.'); await load(); onChanged() }
    setBusy(false)
  }

  async function download(path: string, name: string) { const { data, error: e } = await supabase.storage.from('sales-documents').createSignedUrl(path, 120); if (e) setError(e.message); else { const a = document.createElement('a'); a.href = data.signedUrl; a.download = name; a.click() } }

  if (mode === 'inventory') return <div className="stacked-sections">
    <section className="content-card"><div className="card-title-row"><div><p className="eyebrow">INVENTORY CONTROL</p><h2>{t('Inventory', language)}</h2></div><span className="status-pill">{lowStock.length} {t('Low stock', language)}</span></div><div className="inventory-grid">{products.map((p) => <article className={`inventory-card ${Number(p.stock_quantity || 0) <= Number(p.reorder_level || 0) ? 'low' : ''}`} key={p.id}><span>{p.sku}</span><strong>{p.name}</strong><b>{Number(p.stock_quantity || 0).toFixed(3)}</b><small>{t('Reorder level', language)}: {Number(p.reorder_level || 0).toFixed(3)}</small>{Number(p.stock_quantity || 0) <= Number(p.reorder_level || 0) && <em>{t('Low stock', language)}</em>}</article>)}</div></section>
    <section className="content-card form-card"><h2>{t('Stock adjustment', language)}</h2><form className="compact-form" onSubmit={adjustStock}><label>{t('Products', language)}<select value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">Select product</option>{products.filter((p) => p.active).map((p) => <option value={p.id} key={p.id}>{p.name} ({p.sku})</option>)}</select></label><label>Quantity (+ / −)<input type="number" step="0.001" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} /></label><label>Reason<input value={reason} onChange={(e) => setReason(e.target.value)} /></label><button className="primary-button">{t('Save', language)}</button></form>{notice && <p className="form-message">{notice}</p>}{error && <p className="form-error">{error}</p>}</section>
  </div>

  return <div className="stacked-sections">
    <section className="content-card"><div className="card-title-row"><div><p className="eyebrow">BUSINESS REPORTS</p><h2>{t('Reports', language)}</h2></div></div>{Object.entries(byCurrency).map(([currency, row]) => <div className="finance-grid" key={currency}><article className="finance-card income-card"><span>{t('Monthly sales', language)} ({currency})</span><strong>{money(row.sales, currency)}</strong></article><article className="finance-card net-card"><span>Payments received</span><strong>{money(row.received, currency)}</strong></article><article className="finance-card pending-card"><span>{t('Outstanding invoices', language)}</span><strong>{money(row.outstanding, currency)}</strong></article><article className="finance-card expense-card"><span>Credit notes / refunds</span><strong>{money(row.credits, currency)}</strong></article><article className="finance-card"><span>Realized gross profit</span><strong>{money(row.gross, currency)}</strong></article></div>)}<div className="finance-grid"><article className="finance-card"><span>Inventory cost value (product currencies)</span><strong>{stockCost.toFixed(2)}</strong></article><article className="finance-card pending-card"><span>{t('Low stock', language)}</span><strong>{lowStock.length}</strong></article></div><div className="report-table"><h3>Outstanding by shop</h3>{shops.map((shop) => { const grouped: Record<string, number> = {}; invoices.filter((i) => i.shop_id === shop.id).forEach((i) => grouped[i.currency] = (grouped[i.currency] || 0) + Number(i.balance_amount)); return Object.entries(grouped).filter(([, amount]) => amount > 0).map(([currency, amount]) => <div key={`${shop.id}-${currency}`}><span>{shop.shop_name}</span><strong>{money(amount, currency)}</strong></div>) })}</div></section>
    <section className="content-card form-card"><h2>{t('Credit note', language)} / {t('Refund', language)}</h2><form className="compact-form" onSubmit={issueCredit}><label>Invoice<select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}><option value="">Select invoice</option>{invoices.filter((i) => !['draft','cancelled'].includes(i.status)).map((i) => <option value={i.id} key={i.id}>{i.invoice_code} · {i.currency} {i.total_amount}</option>)}</select></label><label>Amount<input type="number" min="0.01" step="0.01" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} /></label><label>Reason<input value={creditReason} onChange={(e) => setCreditReason(e.target.value)} /></label><label className="checkbox-label"><input type="checkbox" checked={restoreStock} onChange={(e) => setRestoreStock(e.target.checked)} /> Restore delivered stock</label><button className="primary-button" disabled={busy}>Issue credit note</button></form><div className="compact-form refund-controls"><label>Refund method<select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}><option>Cash</option><option>Bank transfer</option><option>Card</option><option>Other</option></select></label><label>Refund reference<input value={refundReference} onChange={(e) => setRefundReference(e.target.value)} /></label><label>EUR → LKR rate<input type="number" step="0.0001" value={refundRate} onChange={(e) => setRefundRate(e.target.value)} /></label></div><div className="report-table">{credits.map((c) => <div key={c.id}><span>{c.credit_code} · {c.reason}</span><strong>{money(c.amount, invoices.find((i) => i.id === c.invoice_id)?.currency || 'EUR')} · {c.status}</strong><span>{c.credit_pdf_path && <button className="small-button" onClick={() => download(c.credit_pdf_path as string, `${c.credit_code}.pdf`)}>PDF</button>}{c.status === 'issued' && <button className="success-button small-button" disabled={busy} onClick={() => markRefunded(c)}>Mark refunded</button>}</span></div>)}</div>{notice && <p className="form-message">{notice}</p>}{error && <p className="form-error">{error}</p>}</section>
  </div>
}
