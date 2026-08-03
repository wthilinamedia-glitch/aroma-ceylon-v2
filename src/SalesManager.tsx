import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  createDeliveryNotePdfBlob,
  createInvoicePdfBlob,
  createPaymentReceiptPdfBlob,
  type SalesDeliveryStatus,
  type SalesInvoicePdfItem,
  type SalesInvoicePdfPayment,
  type SalesInvoiceStatus,
} from './lib/salesPdf'

type ProfileLike = {
  id: string
  full_name: string
  email: string | null
}

type ProductLike = {
  id: string
  name: string
  sku: string
  pack_size: string | null
  selling_price: number
  currency: string
  active: boolean
}

type ShopLike = {
  id: string
  shop_code: string
  shop_name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address_line_1: string | null
  address_line_2: string | null
  city: string | null
  postal_code: string | null
  country: string
  vat_number: string | null
  payment_terms: string
  default_currency: string
  active: boolean
  preferred_language?: 'en' | 'si'
  default_tax_rate?: number
  default_discount?: number
  preferred_payment_method?: string
}

type InvoiceItemRecord = SalesInvoicePdfItem & {
  id: string
  invoice_id: string
  product_id: string | null
  sort_order: number
}

type InvoicePaymentRecord = SalesInvoicePdfPayment & {
  id: string
  invoice_id: string
  notes: string | null
  created_by: string
  created_at: string
  exchange_rate_lkr?: number
  receipt_pdf_path?: string | null
}

type InvoiceRecord = {
  id: string
  invoice_number: number
  invoice_code: string
  shop_id: string
  invoice_date: string
  due_date: string
  delivery_date: string | null
  currency: string
  subtotal: number
  discount_amount: number
  tax_rate: number
  tax_amount: number
  total_amount: number
  paid_amount: number
  balance_amount: number
  status: SalesInvoiceStatus
  delivery_status: SalesDeliveryStatus
  notes: string | null
  invoice_pdf_path: string | null
  delivery_pdf_path: string | null
  created_by: string
  sent_at: string | null
  delivered_at: string | null
  created_at: string
  updated_at: string
  items: InvoiceItemRecord[]
  payments: InvoicePaymentRecord[]
}

type DraftItem = {
  key: string
  product_id: string
  quantity: string
  unit_price: string
}

type SalesManagerProps = {
  profile: ProfileLike
  shops: ShopLike[]
  products: ProductLike[]
  onChanged?: () => void
}

function localIsoDate() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function paymentTermDays(term: string) {
  if (term.toLowerCase() === 'cash') return 0
  const days = Number(term.match(/\d+/)?.[0] || 0)
  return Number.isFinite(days) ? days : 0
}

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: 2,
    }).format(Number(value || 0))
  } catch {
    return `${currency || 'EUR'} ${Number(value || 0).toFixed(2)}`
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`))
}

function safeFilePart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'document'
}

function newDraftItem(): DraftItem {
  return {
    key: crypto.randomUUID(),
    product_id: '',
    quantity: '1',
    unit_price: '0',
  }
}

function statusLabel(status: SalesInvoiceStatus) {
  if (status === 'partially_paid') return 'Partially paid'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function deliveryLabel(status: SalesDeliveryStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function statusClass(status: SalesInvoiceStatus) {
  if (status === 'paid') return 'sales-paid'
  if (status === 'overdue' || status === 'cancelled') return 'sales-overdue'
  if (status === 'draft') return 'sales-draft'
  if (status === 'partially_paid') return 'sales-partial'
  return 'sales-sent'
}

async function downloadPrivateDocument(path: string, fileName: string) {
  const { data, error } = await supabase.storage
    .from('sales-documents')
    .createSignedUrl(path, 120, { download: fileName })

  if (error) throw error
  const link = document.createElement('a')
  link.href = data.signedUrl
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function SalesManager({ profile, shops, products, onChanged }: SalesManagerProps) {
  const [mode, setMode] = useState<'create' | 'history'>('create')
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null)
  const [downloadBusy, setDownloadBusy] = useState('')

  const [shopId, setShopId] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(localIsoDate())
  const [dueDate, setDueDate] = useState(localIsoDate())
  const [deliveryDate, setDeliveryDate] = useState(localIsoDate())
  const [currency, setCurrency] = useState('EUR')
  const [discount, setDiscount] = useState('0')
  const [taxRate, setTaxRate] = useState('0')
  const [notes, setNotes] = useState('')
  const [draftItems, setDraftItems] = useState<DraftItem[]>([newDraftItem()])

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | SalesInvoiceStatus>('all')
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | SalesDeliveryStatus>('all')

  const [paymentDate, setPaymentDate] = useState(localIsoDate())
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Bank transfer')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentExchangeRate, setPaymentExchangeRate] = useState('')

  const activeShops = useMemo(
    () => shops.filter((shop) => shop.active).sort((a, b) => a.shop_name.localeCompare(b.shop_name)),
    [shops],
  )

  const availableProducts = useMemo(
    () => products
      .filter((product) => product.active && product.currency === currency)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [products, currency],
  )

  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === shopId) || null,
    [shops, shopId],
  )

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId) || null,
    [invoices, selectedInvoiceId],
  )

  const paymentInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === paymentInvoiceId) || null,
    [invoices, paymentInvoiceId],
  )

  const loadInvoices = useCallback(async () => {
    setLoading(true)
    setError('')

    await supabase.rpc('refresh_sales_invoice_statuses')

    const [invoiceResult, itemResult, paymentResult] = await Promise.all([
      supabase.from('sales_invoices').select('*').order('invoice_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('sales_invoice_items').select('*').order('sort_order'),
      supabase.from('sales_invoice_payments').select('*').order('payment_date', { ascending: false }).order('created_at', { ascending: false }),
    ])

    if (invoiceResult.error || itemResult.error || paymentResult.error) {
      setError(invoiceResult.error?.message || itemResult.error?.message || paymentResult.error?.message || 'Unable to load sales records.')
      setLoading(false)
      return [] as InvoiceRecord[]
    }

    const itemMap = new Map<string, InvoiceItemRecord[]>()
    ;((itemResult.data || []) as InvoiceItemRecord[]).forEach((item) => {
      itemMap.set(item.invoice_id, [...(itemMap.get(item.invoice_id) || []), item])
    })

    const paymentMap = new Map<string, InvoicePaymentRecord[]>()
    ;((paymentResult.data || []) as InvoicePaymentRecord[]).forEach((payment) => {
      paymentMap.set(payment.invoice_id, [...(paymentMap.get(payment.invoice_id) || []), payment])
    })

    const records = ((invoiceResult.data || []) as Omit<InvoiceRecord, 'items' | 'payments'>[]).map((invoice) => ({
      ...invoice,
      items: itemMap.get(invoice.id) || [],
      payments: paymentMap.get(invoice.id) || [],
    }))

    setInvoices(records)
    setLoading(false)
    return records
  }, [])

  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  useEffect(() => {
    if (!selectedShop || editingInvoiceId) return
    setCurrency(selectedShop.default_currency || 'EUR')
    setDueDate(addDays(invoiceDate, paymentTermDays(selectedShop.payment_terms)))
    setDiscount(String(Number(selectedShop.default_discount || 0)))
    setTaxRate(String(Number(selectedShop.default_tax_rate || 0)))
  }, [selectedShop, invoiceDate, editingInvoiceId])

  useEffect(() => {
    if (!paymentInvoice) return
    setPaymentAmount(Number(paymentInvoice.balance_amount || 0).toFixed(2))
    setPaymentDate(localIsoDate())
    const invoiceShop = shops.find((shop) => shop.id === paymentInvoice.shop_id)
    setPaymentMethod(invoiceShop?.preferred_payment_method || 'Bank transfer')
    setPaymentReference('')
    setPaymentNotes('')
  }, [paymentInvoice, shops])

  const draftTotals = useMemo(() => {
    const subtotal = draftItems.reduce((sum, item) => {
      const quantity = Number(item.quantity || 0)
      const unitPrice = Number(item.unit_price || 0)
      return sum + (Number.isFinite(quantity * unitPrice) ? quantity * unitPrice : 0)
    }, 0)
    const discountAmount = Math.max(Number(discount || 0), 0)
    const taxable = Math.max(subtotal - discountAmount, 0)
    const tax = taxable * Math.max(Number(taxRate || 0), 0) / 100
    return {
      subtotal,
      discount: discountAmount,
      taxable,
      tax,
      total: taxable + tax,
    }
  }, [draftItems, discount, taxRate])

  const visibleInvoices = useMemo(() => {
    const term = search.trim().toLowerCase()
    return invoices.filter((invoice) => {
      const shop = shops.find((item) => item.id === invoice.shop_id)
      const searchable = [
        invoice.invoice_code,
        shop?.shop_code,
        shop?.shop_name,
        shop?.city,
        invoice.status,
        invoice.delivery_status,
      ].filter(Boolean).join(' ').toLowerCase()
      return (statusFilter === 'all' || invoice.status === statusFilter)
        && (deliveryFilter === 'all' || invoice.delivery_status === deliveryFilter)
        && (!term || searchable.includes(term))
    })
  }, [invoices, shops, search, statusFilter, deliveryFilter])

  const salesSummary = useMemo(() => {
    const issued = invoices.filter((invoice) => !['draft', 'cancelled'].includes(invoice.status))
    return {
      invoiced: issued.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0),
      paid: issued.reduce((sum, invoice) => sum + Number(invoice.paid_amount || 0), 0),
      outstanding: issued.reduce((sum, invoice) => sum + Number(invoice.balance_amount || 0), 0),
      overdue: issued.filter((invoice) => invoice.status === 'overdue').length,
      currency: issued[0]?.currency || 'EUR',
      mixed: new Set(issued.map((invoice) => invoice.currency)).size > 1,
    }
  }, [invoices])

  function resetForm() {
    setEditingInvoiceId(null)
    setShopId('')
    setInvoiceDate(localIsoDate())
    setDueDate(localIsoDate())
    setDeliveryDate(localIsoDate())
    setCurrency('EUR')
    setDiscount('0')
    setTaxRate('0')
    setNotes('')
    setDraftItems([newDraftItem()])
  }

  function updateDraftItem(key: string, field: keyof Pick<DraftItem, 'product_id' | 'quantity' | 'unit_price'>, value: string) {
    setDraftItems((current) => current.map((item) => {
      if (item.key !== key) return item
      if (field === 'product_id') {
        const product = products.find((candidate) => candidate.id === value)
        return {
          ...item,
          product_id: value,
          unit_price: product ? String(Number(product.selling_price || 0)) : '0',
        }
      }
      return { ...item, [field]: value }
    }))
  }

  function removeDraftItem(key: string) {
    setDraftItems((current) => current.length === 1 ? current : current.filter((item) => item.key !== key))
  }

  function validateDraft() {
    if (!shopId) return 'Select a shop.'
    if (!invoiceDate || !dueDate) return 'Invoice date and due date are required.'
    if (dueDate < invoiceDate) return 'Due date cannot be before the invoice date.'
    if (deliveryDate && deliveryDate < invoiceDate) return 'Delivery date cannot be before the invoice date.'
    if (draftItems.length === 0) return 'Add at least one product.'
    if (draftItems.some((item) => !item.product_id)) return 'Select a product for every line.'
    if (draftItems.some((item) => Number(item.quantity) <= 0)) return 'Every quantity must be greater than zero.'
    if (draftItems.some((item) => Number(item.unit_price) < 0)) return 'Unit prices cannot be negative.'
    if (Number(discount || 0) > draftTotals.subtotal) return 'Discount cannot be greater than the subtotal.'
    if (Number(taxRate || 0) < 0 || Number(taxRate || 0) > 100) return 'Tax rate must be between 0 and 100.'
    return ''
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    setError('')
    const validation = validateDraft()
    if (validation) {
      setError(validation)
      return
    }

    setBusy(true)
    const payload = draftItems.map((item) => ({
      product_id: item.product_id,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
    }))

    const { error: saveError } = await supabase.rpc('save_sales_invoice', {
      p_invoice_id: editingInvoiceId,
      p_shop_id: shopId,
      p_invoice_date: invoiceDate,
      p_due_date: dueDate,
      p_delivery_date: deliveryDate || null,
      p_currency: currency,
      p_discount_amount: Number(discount || 0),
      p_tax_rate: Number(taxRate || 0),
      p_notes: notes,
      p_items: payload,
    })

    setBusy(false)
    if (saveError) {
      setError(saveError.message)
      return
    }

    await loadInvoices()
    setMessage(editingInvoiceId ? 'Invoice draft updated.' : 'Invoice draft saved.')
    resetForm()
    setMode('history')
  }

  function editDraft(invoice: InvoiceRecord) {
    if (invoice.status !== 'draft') return
    setEditingInvoiceId(invoice.id)
    setShopId(invoice.shop_id)
    setInvoiceDate(invoice.invoice_date)
    setDueDate(invoice.due_date)
    setDeliveryDate(invoice.delivery_date || '')
    setCurrency(invoice.currency)
    setDiscount(String(Number(invoice.discount_amount || 0)))
    setTaxRate(String(Number(invoice.tax_rate || 0)))
    setNotes(invoice.notes || '')
    setDraftItems(invoice.items.map((item) => ({
      key: crypto.randomUUID(),
      product_id: item.product_id || '',
      quantity: String(Number(item.quantity)),
      unit_price: String(Number(item.unit_price)),
    })))
    setSelectedInvoiceId(null)
    setMode('create')
    setMessage(`Editing ${invoice.invoice_code}.`)
    setError('')
  }

  async function deleteDraft(invoice: InvoiceRecord) {
    if (invoice.status !== 'draft') return
    if (!window.confirm(`Delete draft ${invoice.invoice_code}?`)) return
    setBusy(true)
    setError('')
    const { error: deleteError } = await supabase
      .from('sales_invoices')
      .delete()
      .eq('id', invoice.id)
      .eq('status', 'draft')
    setBusy(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setSelectedInvoiceId(null)
    setMessage('Invoice draft deleted.')
    await loadInvoices()
  }

  async function fetchInvoiceBundle(invoiceId: string) {
    const [invoiceResult, itemResult, paymentResult] = await Promise.all([
      supabase.from('sales_invoices').select('*').eq('id', invoiceId).single(),
      supabase.from('sales_invoice_items').select('*').eq('invoice_id', invoiceId).order('sort_order'),
      supabase.from('sales_invoice_payments').select('*').eq('invoice_id', invoiceId).order('payment_date', { ascending: false }),
    ])

    if (invoiceResult.error || itemResult.error || paymentResult.error) {
      throw new Error(invoiceResult.error?.message || itemResult.error?.message || paymentResult.error?.message || 'Unable to load invoice.')
    }

    return {
      ...(invoiceResult.data as Omit<InvoiceRecord, 'items' | 'payments'>),
      items: (itemResult.data || []) as InvoiceItemRecord[],
      payments: (paymentResult.data || []) as InvoicePaymentRecord[],
    } as InvoiceRecord
  }

  async function uploadInvoicePdf(invoice: InvoiceRecord, shop: ShopLike) {
    const blob = await createInvoicePdfBlob(invoice, shop, invoice.items, invoice.payments, profile.full_name || profile.email || 'Administrator')
    const path = `${invoice.id}/invoice-${invoice.invoice_code}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('sales-documents')
      .upload(path, blob, { contentType: 'application/pdf', upsert: true })
    if (uploadError) throw uploadError
    return path
  }

  async function uploadDeliveryPdf(invoice: InvoiceRecord, shop: ShopLike) {
    const blob = await createDeliveryNotePdfBlob(invoice, shop, invoice.items, profile.full_name || profile.email || 'Administrator')
    const path = `${invoice.id}/delivery-${invoice.invoice_code}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('sales-documents')
      .upload(path, blob, { contentType: 'application/pdf', upsert: true })
    if (uploadError) throw uploadError
    return path
  }

  async function finalizeInvoice(invoice: InvoiceRecord) {
    if (invoice.status !== 'draft') return
    if (!window.confirm(`Finalize ${invoice.invoice_code} and create both PDFs?`)) return
    setBusy(true)
    setError('')
    setMessage('')

    try {
      const current = await fetchInvoiceBundle(invoice.id)
      const shop = shops.find((item) => item.id === current.shop_id)
      if (!shop) throw new Error('The invoice shop is unavailable.')
      const sentAt = new Date().toISOString()
      const finalized: InvoiceRecord = { ...current, status: 'sent', sent_at: sentAt }
      const [invoicePath, deliveryPath] = await Promise.all([
        uploadInvoicePdf(finalized, shop),
        uploadDeliveryPdf(finalized, shop),
      ])

      const { error: updateError } = await supabase
        .from('sales_invoices')
        .update({
          status: 'sent',
          sent_at: sentAt,
          invoice_pdf_path: invoicePath,
          delivery_pdf_path: deliveryPath,
        })
        .eq('id', invoice.id)
        .eq('status', 'draft')
      if (updateError) throw updateError

      setMessage('Invoice finalized. Invoice PDF and delivery note created.')
      setSelectedInvoiceId(null)
      await loadInvoices()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to finalize the invoice.')
    } finally {
      setBusy(false)
    }
  }

  async function regenerateDocuments(invoice: InvoiceRecord) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const current = await fetchInvoiceBundle(invoice.id)
      const shop = shops.find((item) => item.id === current.shop_id)
      if (!shop) throw new Error('The invoice shop is unavailable.')
      const [invoicePath, deliveryPath] = await Promise.all([
        uploadInvoicePdf(current, shop),
        uploadDeliveryPdf(current, shop),
      ])
      const { error: updateError } = await supabase
        .from('sales_invoices')
        .update({ invoice_pdf_path: invoicePath, delivery_pdf_path: deliveryPath })
        .eq('id', invoice.id)
      if (updateError) throw updateError
      setMessage('Invoice and delivery PDFs refreshed.')
      await loadInvoices()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to refresh the PDFs.')
    } finally {
      setBusy(false)
    }
  }

  async function updateDeliveryStatus(invoice: InvoiceRecord, nextStatus: SalesDeliveryStatus) {
    setBusy(true)
    setError('')
    const deliveredAt = nextStatus === 'delivered' ? new Date().toISOString() : null
    const { error: updateError } = await supabase
      .from('sales_invoices')
      .update({ delivery_status: nextStatus, delivered_at: deliveredAt })
      .eq('id', invoice.id)
    if (updateError) {
      setBusy(false)
      setError(updateError.message)
      return
    }

    try {
      const current = await fetchInvoiceBundle(invoice.id)
      const shop = shops.find((item) => item.id === current.shop_id)
      if (shop) {
        const path = await uploadDeliveryPdf(current, shop)
        await supabase.from('sales_invoices').update({ delivery_pdf_path: path }).eq('id', invoice.id)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Delivery status saved, but the PDF could not be refreshed.')
    }

    setMessage(nextStatus === 'delivered' ? 'Delivery marked as delivered.' : 'Delivery marked as packed.')
    setBusy(false)
    await loadInvoices()
    onChanged?.()
  }

  async function addPayment(event: FormEvent) {
    event.preventDefault()
    if (!paymentInvoice) return
    setBusy(true)
    setError('')
    setMessage('')

    const amount = Number(paymentAmount || 0)
    if (amount <= 0 || amount > Number(paymentInvoice.balance_amount) + 0.01) {
      setBusy(false)
      setError('Enter a payment greater than zero and not more than the outstanding balance.')
      return
    }

    if (paymentInvoice.currency === 'EUR' && Number(paymentExchangeRate || 0) <= 0) {
      setBusy(false)
      setError('Enter the EUR to LKR exchange rate so the payment can be added to income and profit correctly.')
      return
    }

    const { data: savedPayment, error: paymentError } = await supabase.from('sales_invoice_payments').insert({
      invoice_id: paymentInvoice.id,
      payment_date: paymentDate,
      amount,
      payment_method: paymentMethod,
      reference: paymentReference.trim() || null,
      notes: paymentNotes.trim() || null,
      exchange_rate_lkr: paymentInvoice.currency === 'EUR' ? Number(paymentExchangeRate || 0) : 1,
      created_by: profile.id,
    }).select('*').single()

    if (paymentError) {
      setBusy(false)
      setError(paymentError.message)
      return
    }

    try {
      const current = await fetchInvoiceBundle(paymentInvoice.id)
      const shop = shops.find((item) => item.id === current.shop_id)
      if (shop) {
        const path = await uploadInvoicePdf(current, shop)
        await supabase.from('sales_invoices').update({ invoice_pdf_path: path }).eq('id', current.id)
        if (savedPayment) {
          const receiptBlob = await createPaymentReceiptPdfBlob(current, shop, savedPayment, profile.full_name || profile.email || 'Administrator')
          const receiptPath = `${current.id}/receipt-${savedPayment.id}.pdf`
          const { error: receiptUploadError } = await supabase.storage.from('sales-documents').upload(receiptPath, receiptBlob, { contentType: 'application/pdf', upsert: true })
          if (receiptUploadError) throw receiptUploadError
          await supabase.from('sales_invoice_payments').update({ receipt_pdf_path: receiptPath }).eq('id', savedPayment.id)
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Payment saved, but the invoice PDF could not be refreshed.')
    }

    setPaymentInvoiceId(null)
    setPaymentExchangeRate('')
    setSelectedInvoiceId(null)
    setMessage('Payment recorded and the outstanding balance updated.')
    setBusy(false)
    await loadInvoices()
    onChanged?.()
  }

  async function removePayment(invoice: InvoiceRecord, payment: InvoicePaymentRecord) {
    if (!window.confirm(`Delete payment ${formatCurrency(payment.amount, invoice.currency)}?`)) return
    setBusy(true)
    setError('')
    const { error: deleteError } = await supabase
      .from('sales_invoice_payments')
      .delete()
      .eq('id', payment.id)
    if (deleteError) {
      setBusy(false)
      setError(deleteError.message)
      return
    }

    try {
      const current = await fetchInvoiceBundle(invoice.id)
      const shop = shops.find((item) => item.id === current.shop_id)
      if (shop) {
        const path = await uploadInvoicePdf(current, shop)
        await supabase.from('sales_invoices').update({ invoice_pdf_path: path }).eq('id', current.id)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Payment removed, but the invoice PDF could not be refreshed.')
    }

    setMessage('Payment removed and the balance recalculated.')
    setSelectedInvoiceId(null)
    setBusy(false)
    await loadInvoices()
    onChanged?.()
  }

  async function downloadPaymentReceipt(invoice: InvoiceRecord, payment: InvoicePaymentRecord) {
    if (!payment.receipt_pdf_path) return
    setDownloadBusy(`receipt-${payment.id}`)
    setError('')
    try {
      await downloadPrivateDocument(payment.receipt_pdf_path, `Aroma_Ceylon_Receipt_${safeFilePart(invoice.invoice_code)}_${safeFilePart(payment.id)}.pdf`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to download the payment receipt.')
    } finally {
      setDownloadBusy('')
    }
  }

  async function downloadInvoice(invoice: InvoiceRecord) {
    if (!invoice.invoice_pdf_path) return
    setDownloadBusy(`invoice-${invoice.id}`)
    setError('')
    try {
      await downloadPrivateDocument(
        invoice.invoice_pdf_path,
        `Aroma_Ceylon_Invoice_${safeFilePart(invoice.invoice_code)}.pdf`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to download the invoice PDF.')
    } finally {
      setDownloadBusy('')
    }
  }

  async function downloadDelivery(invoice: InvoiceRecord) {
    if (!invoice.delivery_pdf_path) return
    setDownloadBusy(`delivery-${invoice.id}`)
    setError('')
    try {
      await downloadPrivateDocument(
        invoice.delivery_pdf_path,
        `Aroma_Ceylon_Delivery_Note_${safeFilePart(invoice.invoice_code)}.pdf`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to download the delivery note.')
    } finally {
      setDownloadBusy('')
    }
  }

  return (
    <div className="stacked-sections sales-module">
      <section className="content-card sales-hero-card">
        <div className="card-title-row sales-title-row">
          <div>
            <p className="eyebrow">SALES CONTROL</p>
            <h2>Deliveries & invoices</h2>
            <p className="section-copy">Create shop invoices, delivery notes, payment records and premium white-and-gold PDFs.</p>
          </div>
          <div className="sales-mode-switch" aria-label="Sales sections">
            <button type="button" className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>New invoice</button>
            <button type="button" className={mode === 'history' ? 'active' : ''} onClick={() => setMode('history')}>Invoice history</button>
          </div>
        </div>
        {message && <p className="success-message sales-page-message">{message}</p>}
        {error && <p className="error-message sales-page-error">{error}</p>}
      </section>

      {mode === 'create' && (
        <form className="content-card sales-form" onSubmit={saveDraft}>
          <div className="card-title-row">
            <div>
              <p className="eyebrow">{editingInvoiceId ? 'EDIT DRAFT' : 'NEW SALE'}</p>
              <h2>{editingInvoiceId ? 'Update invoice draft' : 'Create invoice draft'}</h2>
              <p className="section-copy">Save the draft first. Finalizing creates the invoice and delivery-note PDFs.</p>
            </div>
            {editingInvoiceId && <button className="small-button" type="button" onClick={resetForm}>Cancel edit</button>}
          </div>

          <div className="sales-form-grid">
            <label className="sales-shop-field">
              Shop
              <select value={shopId} onChange={(event) => setShopId(event.target.value)} required>
                <option value="">Select active shop</option>
                {activeShops.map((shop) => <option key={shop.id} value={shop.id}>{shop.shop_code} • {shop.shop_name}</option>)}
              </select>
            </label>
            <label>
              Invoice date
              <input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required />
            </label>
            <label>
              Due date
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
            </label>
            <label>
              Delivery date
              <input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
            </label>
            <label>
              Currency
              <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                <option value="EUR">EUR</option>
                <option value="LKR">LKR</option>
              </select>
            </label>
            <label>
              Discount amount
              <input type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} />
            </label>
            <label>
              Tax / VAT rate %
              <input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} />
            </label>
          </div>

          {selectedShop && (
            <div className="sales-shop-summary">
              <div><span>Shop</span><strong>{selectedShop.shop_name}</strong></div>
              <div><span>Payment terms</span><strong>{selectedShop.payment_terms}</strong></div>
              <div><span>Default currency</span><strong>{selectedShop.default_currency}</strong></div>
              <div><span>Location</span><strong>{[selectedShop.city, selectedShop.country].filter(Boolean).join(', ')}</strong></div>
            </div>
          )}

          <div className="sales-items-heading">
            <div>
              <p className="eyebrow">PRODUCT LINES</p>
              <h3>Products & quantities</h3>
            </div>
            <button className="secondary-button" type="button" onClick={() => setDraftItems((current) => [...current, newDraftItem()])}>+ Add product</button>
          </div>

          {availableProducts.length === 0 && <p className="form-message">No active products use {currency}. Add or update a product before saving this invoice.</p>}

          <div className="sales-item-list">
            {draftItems.map((item, index) => {
              const product = products.find((candidate) => candidate.id === item.product_id)
              const lineTotal = Number(item.quantity || 0) * Number(item.unit_price || 0)
              return (
                <article className="sales-item-row" key={item.key}>
                  <span className="sales-item-number">{index + 1}</span>
                  <label className="sales-product-select">
                    Product
                    <select value={item.product_id} onChange={(event) => updateDraftItem(item.key, 'product_id', event.target.value)}>
                      <option value="">Select product</option>
                      {availableProducts.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>{candidate.sku} • {candidate.name}{candidate.pack_size ? ` • ${candidate.pack_size}` : ''}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateDraftItem(item.key, 'quantity', event.target.value)} />
                  </label>
                  <label>
                    Unit price
                    <input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateDraftItem(item.key, 'unit_price', event.target.value)} />
                  </label>
                  <div className="sales-line-total">
                    <span>Line total</span>
                    <strong>{formatCurrency(lineTotal, currency)}</strong>
                    {product && <small>{product.sku}{product.pack_size ? ` • ${product.pack_size}` : ''}</small>}
                  </div>
                  <button className="delete-button sales-remove-item" type="button" disabled={draftItems.length === 1} onClick={() => removeDraftItem(item.key)}>Remove</button>
                </article>
              )
            })}
          </div>

          <div className="sales-bottom-grid">
            <label className="sales-notes-field">
              Invoice / delivery notes
              <textarea rows={6} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes for the shop or delivery team" />
            </label>
            <div className="sales-draft-total">
              <div><span>Subtotal</span><strong>{formatCurrency(draftTotals.subtotal, currency)}</strong></div>
              <div><span>Discount</span><strong>−{formatCurrency(draftTotals.discount, currency)}</strong></div>
              <div><span>Taxable amount</span><strong>{formatCurrency(draftTotals.taxable, currency)}</strong></div>
              <div><span>Tax</span><strong>{formatCurrency(draftTotals.tax, currency)}</strong></div>
              <div className="sales-grand-total"><span>Invoice total</span><strong>{formatCurrency(draftTotals.total, currency)}</strong></div>
            </div>
          </div>

          <div className="sales-form-actions">
            <button className="primary-button" type="submit" disabled={busy || availableProducts.length === 0}>{busy ? 'Saving…' : editingInvoiceId ? 'Update draft' : 'Save draft'}</button>
            <button className="small-button" type="button" onClick={() => { resetForm(); setMode('history') }}>View invoice history</button>
          </div>
        </form>
      )}

      {mode === 'history' && (
        <>
          <section className="sales-summary-grid">
            <article><span>Total invoiced</span><strong>{salesSummary.mixed ? 'Mixed currencies' : formatCurrency(salesSummary.invoiced, salesSummary.currency)}</strong></article>
            <article><span>Payments received</span><strong>{salesSummary.mixed ? 'Mixed currencies' : formatCurrency(salesSummary.paid, salesSummary.currency)}</strong></article>
            <article><span>Outstanding</span><strong>{salesSummary.mixed ? 'Mixed currencies' : formatCurrency(salesSummary.outstanding, salesSummary.currency)}</strong></article>
            <article><span>Overdue invoices</span><strong>{salesSummary.overdue}</strong></article>
          </section>

          <section className="content-card">
            <div className="card-title-row">
              <div>
                <p className="eyebrow">SALES RECORDS</p>
                <h2>Invoice history</h2>
                <p className="section-copy">Search, finalize, download documents, update deliveries and record payments.</p>
              </div>
              <button className="primary-button" type="button" onClick={() => { resetForm(); setMode('create') }}>New invoice</button>
            </div>

            <div className="sales-history-toolbar">
              <label>
                Search
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Invoice, shop or city" />
              </label>
              <label>
                Invoice status
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | SalesInvoiceStatus)}>
                  <option value="all">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="partially_paid">Partially paid</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </label>
              <label>
                Delivery status
                <select value={deliveryFilter} onChange={(event) => setDeliveryFilter(event.target.value as 'all' | SalesDeliveryStatus)}>
                  <option value="all">All deliveries</option>
                  <option value="pending">Pending</option>
                  <option value="packed">Packed</option>
                  <option value="delivered">Delivered</option>
                </select>
              </label>
            </div>

            {loading ? (
              <div className="empty-state">Loading invoices…</div>
            ) : visibleInvoices.length === 0 ? (
              <div className="empty-state">No invoices match these filters.</div>
            ) : (
              <div className="sales-invoice-list">
                {visibleInvoices.map((invoice) => {
                  const shop = shops.find((item) => item.id === invoice.shop_id)
                  return (
                    <article className="sales-invoice-card" key={invoice.id}>
                      <div className="sales-invoice-heading">
                        <div>
                          <span className="sales-invoice-code">{invoice.invoice_code}</span>
                          <h3>{shop?.shop_name || 'Unknown shop'}</h3>
                          <p>{formatDate(invoice.invoice_date)} • Due {formatDate(invoice.due_date)}</p>
                        </div>
                        <div className="sales-card-statuses">
                          <span className={`sales-status ${statusClass(invoice.status)}`}>{statusLabel(invoice.status)}</span>
                          <span className={`sales-delivery-status ${invoice.delivery_status}`}>{deliveryLabel(invoice.delivery_status)}</span>
                        </div>
                      </div>
                      <div className="sales-money-grid">
                        <div><span>Total</span><strong>{formatCurrency(invoice.total_amount, invoice.currency)}</strong></div>
                        <div><span>Paid</span><strong>{formatCurrency(invoice.paid_amount, invoice.currency)}</strong></div>
                        <div><span>Balance</span><strong>{formatCurrency(invoice.balance_amount, invoice.currency)}</strong></div>
                        <div><span>Items</span><strong>{invoice.items.length}</strong></div>
                      </div>
                      <div className="sales-card-actions">
                        <button className="small-button" type="button" onClick={() => setSelectedInvoiceId(invoice.id)}>Details</button>
                        {invoice.status === 'draft' && <button className="edit-button" type="button" onClick={() => editDraft(invoice)}>Edit</button>}
                        {invoice.status === 'draft' && <button className="primary-button small-button" type="button" disabled={busy} onClick={() => finalizeInvoice(invoice)}>Finalize & PDFs</button>}
                        {invoice.invoice_pdf_path && <button className="small-button" type="button" disabled={downloadBusy === `invoice-${invoice.id}`} onClick={() => downloadInvoice(invoice)}>{downloadBusy === `invoice-${invoice.id}` ? 'Preparing…' : 'Invoice PDF'}</button>}
                        {invoice.delivery_pdf_path && <button className="small-button" type="button" disabled={downloadBusy === `delivery-${invoice.id}`} onClick={() => downloadDelivery(invoice)}>{downloadBusy === `delivery-${invoice.id}` ? 'Preparing…' : 'Delivery PDF'}</button>}
                        {!['draft', 'paid', 'cancelled'].includes(invoice.status) && <button className="success-button small-button" type="button" onClick={() => setPaymentInvoiceId(invoice.id)}>Add payment</button>}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}

      {selectedInvoice && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedInvoiceId(null)}>
          <section className="modal-card sales-detail-modal" role="dialog" aria-modal="true" aria-labelledby="sales-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="card-title-row">
              <div>
                <p className="eyebrow">INVOICE DETAILS</p>
                <h2 id="sales-detail-title">{selectedInvoice.invoice_code}</h2>
                <p className="section-copy">{shops.find((shop) => shop.id === selectedInvoice.shop_id)?.shop_name || 'Unknown shop'}</p>
              </div>
              <button className="icon-close" type="button" onClick={() => setSelectedInvoiceId(null)} aria-label="Close">×</button>
            </div>

            <div className="sales-detail-status-row">
              <span className={`sales-status ${statusClass(selectedInvoice.status)}`}>{statusLabel(selectedInvoice.status)}</span>
              <span className={`sales-delivery-status ${selectedInvoice.delivery_status}`}>{deliveryLabel(selectedInvoice.delivery_status)}</span>
            </div>

            <div className="sales-detail-grid">
              <div><span>Invoice date</span><strong>{formatDate(selectedInvoice.invoice_date)}</strong></div>
              <div><span>Due date</span><strong>{formatDate(selectedInvoice.due_date)}</strong></div>
              <div><span>Delivery date</span><strong>{selectedInvoice.delivery_date ? formatDate(selectedInvoice.delivery_date) : 'Not set'}</strong></div>
              <div><span>Currency</span><strong>{selectedInvoice.currency}</strong></div>
            </div>

            <div className="sales-detail-items">
              <h3>Products</h3>
              {selectedInvoice.items.map((item) => (
                <div key={item.id}>
                  <span><strong>{item.product_name}</strong><small>{item.sku}{item.pack_size ? ` • ${item.pack_size}` : ''}</small></span>
                  <span>{Number(item.quantity)} × {formatCurrency(item.unit_price, selectedInvoice.currency)}</span>
                  <strong>{formatCurrency(item.line_total, selectedInvoice.currency)}</strong>
                </div>
              ))}
            </div>

            <div className="sales-detail-totals">
              <div><span>Subtotal</span><strong>{formatCurrency(selectedInvoice.subtotal, selectedInvoice.currency)}</strong></div>
              <div><span>Discount</span><strong>−{formatCurrency(selectedInvoice.discount_amount, selectedInvoice.currency)}</strong></div>
              <div><span>Tax</span><strong>{formatCurrency(selectedInvoice.tax_amount, selectedInvoice.currency)}</strong></div>
              <div><span>Total</span><strong>{formatCurrency(selectedInvoice.total_amount, selectedInvoice.currency)}</strong></div>
              <div><span>Paid</span><strong>{formatCurrency(selectedInvoice.paid_amount, selectedInvoice.currency)}</strong></div>
              <div className="sales-detail-balance"><span>Balance</span><strong>{formatCurrency(selectedInvoice.balance_amount, selectedInvoice.currency)}</strong></div>
            </div>

            <div className="sales-payment-history">
              <div className="sales-subtitle-row"><h3>Payments</h3>{!['draft', 'paid', 'cancelled'].includes(selectedInvoice.status) && <button className="success-button small-button" type="button" onClick={() => setPaymentInvoiceId(selectedInvoice.id)}>Add payment</button>}</div>
              {selectedInvoice.payments.length === 0 ? <p className="section-copy">No payments recorded.</p> : selectedInvoice.payments.map((payment) => (
                <div className="sales-payment-row" key={payment.id}>
                  <span><strong>{formatCurrency(payment.amount, selectedInvoice.currency)}</strong><small>{formatDate(payment.payment_date)} • {payment.payment_method}{payment.reference ? ` • ${payment.reference}` : ''}</small></span>
                  <span className="sales-payment-actions">{payment.receipt_pdf_path && <button className="small-button" type="button" disabled={downloadBusy === `receipt-${payment.id}`} onClick={() => downloadPaymentReceipt(selectedInvoice, payment)}>Receipt PDF</button>}<button className="delete-button" type="button" disabled={busy} onClick={() => removePayment(selectedInvoice, payment)}>Delete</button></span>
                </div>
              ))}
            </div>

            {selectedInvoice.notes && <div className="sales-detail-note"><span>Notes</span><p>{selectedInvoice.notes}</p></div>}

            <div className="sales-detail-actions">
              {selectedInvoice.status === 'draft' && <button className="edit-button" type="button" onClick={() => editDraft(selectedInvoice)}>Edit draft</button>}
              {selectedInvoice.status === 'draft' && <button className="primary-button" type="button" disabled={busy} onClick={() => finalizeInvoice(selectedInvoice)}>Finalize & create PDFs</button>}
              {selectedInvoice.status === 'draft' && <button className="delete-button" type="button" disabled={busy} onClick={() => deleteDraft(selectedInvoice)}>Delete draft</button>}
              {selectedInvoice.status !== 'draft' && selectedInvoice.delivery_status === 'pending' && <button className="small-button" type="button" disabled={busy} onClick={() => updateDeliveryStatus(selectedInvoice, 'packed')}>Mark packed</button>}
              {selectedInvoice.status !== 'draft' && selectedInvoice.delivery_status !== 'delivered' && <button className="success-button small-button" type="button" disabled={busy} onClick={() => updateDeliveryStatus(selectedInvoice, 'delivered')}>Mark delivered</button>}
              {selectedInvoice.status !== 'draft' && <button className="small-button" type="button" disabled={busy} onClick={() => regenerateDocuments(selectedInvoice)}>Refresh PDFs</button>}
              {selectedInvoice.invoice_pdf_path && <button className="small-button" type="button" onClick={() => downloadInvoice(selectedInvoice)}>Download invoice</button>}
              {selectedInvoice.delivery_pdf_path && <button className="small-button" type="button" onClick={() => downloadDelivery(selectedInvoice)}>Download delivery note</button>}
            </div>
          </section>
        </div>
      )}

      {paymentInvoice && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPaymentInvoiceId(null)}>
          <section className="modal-card sales-payment-modal" role="dialog" aria-modal="true" aria-labelledby="sales-payment-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="card-title-row">
              <div>
                <p className="eyebrow">RECORD PAYMENT</p>
                <h2 id="sales-payment-title">{paymentInvoice.invoice_code}</h2>
                <p className="section-copy">Outstanding: {formatCurrency(paymentInvoice.balance_amount, paymentInvoice.currency)}</p>
              </div>
              <button className="icon-close" type="button" onClick={() => setPaymentInvoiceId(null)} aria-label="Close">×</button>
            </div>
            <form className="sales-payment-form" onSubmit={addPayment}>
              <label>
                Payment date
                <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required />
              </label>
              <label>
                Amount ({paymentInvoice.currency})
                <input type="number" min="0.01" max={Number(paymentInvoice.balance_amount)} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} required />
              </label>
              {paymentInvoice.currency === 'EUR' && <label>
                EUR to LKR exchange rate
                <input type="number" min="0.0001" step="0.0001" value={paymentExchangeRate} onChange={(event) => setPaymentExchangeRate(event.target.value)} required />
              </label>}
              <label>
                Method
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                  <option>Cash</option>
                  <option>Bank transfer</option>
                  <option>Card</option>
                  <option>Other</option>
                </select>
              </label>
              <label>
                Reference
                <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Optional bank or receipt reference" />
              </label>
              <label className="sales-payment-notes">
                Notes
                <textarea rows={3} value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} />
              </label>
              <div className="modal-actions sales-payment-actions">
                <button className="small-button" type="button" onClick={() => setPaymentInvoiceId(null)}>Cancel</button>
                <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save payment'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
