import { jsPDF } from 'jspdf'
import {
  addPremiumPdfFooter,
  addPremiumPdfHeader,
  drawPdfSectionTitle,
  loadPdfLogoDataUrl,
  PDF_BRAND,
} from './pdfBrand'

export type SalesInvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'
export type SalesDeliveryStatus = 'pending' | 'packed' | 'delivered' | 'cancelled'

export type SalesInvoicePdfRecord = {
  id: string
  invoice_code: string
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
  sent_at: string | null
  delivered_at: string | null
}

export type SalesInvoicePdfItem = {
  product_name: string
  sku: string
  pack_size: string | null
  quantity: number
  unit_price: number
  line_total: number
}

export type SalesInvoicePdfPayment = {
  payment_date: string
  amount: number
  payment_method: string
  reference: string | null
}

export type SalesShopPdfRecord = {
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

function shortQuantity(value: number) {
  const number = Number(value || 0)
  return Number.isInteger(number) ? String(number) : number.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function shopAddress(shop: SalesShopPdfRecord) {
  return [
    shop.address_line_1,
    shop.address_line_2,
    [shop.postal_code, shop.city].filter(Boolean).join(' '),
    shop.country,
  ].filter(Boolean)
}

function addPageHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  status: string,
  logo: string | null,
) {
  return addPremiumPdfHeader(doc, {
    title,
    subtitle,
    status,
    logoDataUrl: logo,
  })
}

function drawCustomerAndDocumentCards(
  doc: jsPDF,
  invoice: SalesInvoicePdfRecord,
  shop: SalesShopPdfRecord,
  startY: number,
  documentLabel: string,
) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 16
  const gap = 8
  const width = (pageWidth - margin * 2 - gap) / 2
  const rightX = margin + width + gap
  const height = 49

  doc.setFillColor(...PDF_BRAND.cream)
  doc.setDrawColor(...PDF_BRAND.line)
  doc.setLineWidth(0.35)
  doc.roundedRect(margin, startY, width, height, 2.5, 2.5, 'FD')
  doc.roundedRect(rightX, startY, width, height, 2.5, 2.5, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...PDF_BRAND.darkGold)
  doc.text('BILL TO', margin + 6, startY + 8)
  doc.text(documentLabel.toUpperCase(), rightX + 6, startY + 8)

  doc.setFont('times', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...PDF_BRAND.ink)
  doc.text(doc.splitTextToSize(shop.shop_name, width - 12)[0] || shop.shop_code, margin + 6, startY + 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...PDF_BRAND.muted)
  const customerLines = [
    shop.contact_person,
    ...shopAddress(shop),
    shop.phone,
    shop.email,
    shop.vat_number ? `VAT / Tax: ${shop.vat_number}` : null,
  ].filter(Boolean) as string[]
  const customerText = doc.splitTextToSize(customerLines.join('\n'), width - 12).slice(0, 5)
  doc.text(customerText, margin + 6, startY + 23)

  const rows: Array<[string, string]> = [
    ['Invoice number', invoice.invoice_code],
    ['Invoice date', formatDate(invoice.invoice_date)],
    ['Due date', formatDate(invoice.due_date)],
    ['Delivery date', invoice.delivery_date ? formatDate(invoice.delivery_date) : 'Not set'],
    ['Currency', invoice.currency],
  ]

  rows.forEach(([label, value], index) => {
    const rowY = startY + 15 + index * 6.6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...PDF_BRAND.muted)
    doc.text(label, rightX + 6, rowY)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...PDF_BRAND.ink)
    doc.text(value, rightX + width - 6, rowY, { align: 'right' })
  })

  return startY + height + 10
}

function drawInvoiceTableHeader(doc: jsPDF, y: number) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 16
  const width = pageWidth - margin * 2
  doc.setFillColor(...PDF_BRAND.paleGold)
  doc.setDrawColor(...PDF_BRAND.gold)
  doc.setLineWidth(0.35)
  doc.roundedRect(margin, y, width, 9, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...PDF_BRAND.darkGold)
  doc.text('PRODUCT', margin + 4, y + 5.9)
  doc.text('QTY', 134, y + 5.9, { align: 'right' })
  doc.text('UNIT PRICE', 166, y + 5.9, { align: 'right' })
  doc.text('TOTAL', pageWidth - margin - 4, y + 5.9, { align: 'right' })
  return y + 9
}

function drawDeliveryTableHeader(doc: jsPDF, y: number) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 16
  const width = pageWidth - margin * 2
  doc.setFillColor(...PDF_BRAND.paleGold)
  doc.setDrawColor(...PDF_BRAND.gold)
  doc.setLineWidth(0.35)
  doc.roundedRect(margin, y, width, 9, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...PDF_BRAND.darkGold)
  doc.text('PRODUCT', margin + 4, y + 5.9)
  doc.text('SKU / PACK', 155, y + 5.9, { align: 'right' })
  doc.text('QUANTITY', pageWidth - margin - 4, y + 5.9, { align: 'right' })
  return y + 9
}

function addAllPageFooters(
  doc: jsPDF,
  leftTop: string,
  leftBottom: string,
  rightTop: string,
) {
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    addPremiumPdfFooter(doc, { leftTop, leftBottom, rightTop })
  }
}

export async function createInvoicePdfBlob(
  invoice: SalesInvoicePdfRecord,
  shop: SalesShopPdfRecord,
  items: SalesInvoicePdfItem[],
  payments: SalesInvoicePdfPayment[],
  authorizedBy: string,
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 16
  const bottomLimit = pageHeight - 34
  let logo: string | null = null

  try {
    logo = await loadPdfLogoDataUrl()
  } catch {
    logo = null
  }

  let y = addPageHeader(
    doc,
    'TAX INVOICE',
    `${invoice.invoice_code} • ${formatDate(invoice.invoice_date)}`,
    invoice.status,
    logo,
  )
  y = drawCustomerAndDocumentCards(doc, invoice, shop, y, 'Invoice details')
  drawPdfSectionTitle(doc, 'Products & charges', y)
  y += 7
  y = drawInvoiceTableHeader(doc, y)

  items.forEach((item) => {
    const rowHeight = 12
    if (y + rowHeight > bottomLimit) {
      doc.addPage()
      y = addPageHeader(doc, 'TAX INVOICE', invoice.invoice_code, invoice.status, logo)
      drawPdfSectionTitle(doc, 'Products & charges continued', y)
      y += 7
      y = drawInvoiceTableHeader(doc, y)
    }

    doc.setDrawColor(...PDF_BRAND.line)
    doc.setLineWidth(0.25)
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.4)
    doc.setTextColor(...PDF_BRAND.ink)
    const product = doc.splitTextToSize(item.product_name, 92)[0] || item.product_name
    doc.text(product, margin + 4, y + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.8)
    doc.setTextColor(...PDF_BRAND.muted)
    doc.text([item.sku, item.pack_size].filter(Boolean).join(' • '), margin + 4, y + 9.2)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...PDF_BRAND.ink)
    doc.text(shortQuantity(item.quantity), 134, y + 7, { align: 'right' })
    doc.text(formatCurrency(item.unit_price, invoice.currency), 166, y + 7, { align: 'right' })
    doc.text(formatCurrency(item.line_total, invoice.currency), pageWidth - margin - 4, y + 7, { align: 'right' })
    y += rowHeight
  })

  const totalsHeight = 67
  if (y + totalsHeight > bottomLimit) {
    doc.addPage()
    y = addPageHeader(doc, 'TAX INVOICE', invoice.invoice_code, invoice.status, logo)
  } else {
    y += 7
  }

  const summaryWidth = 78
  const summaryX = pageWidth - margin - summaryWidth
  const noteWidth = summaryX - margin - 8

  if (invoice.notes || payments.length > 0) {
    drawPdfSectionTitle(doc, payments.length > 0 ? 'Payment information' : 'Notes', y, margin, noteWidth)
    let noteY = y + 10
    if (payments.length > 0) {
      payments.slice(0, 4).forEach((payment) => {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.7)
        doc.setTextColor(...PDF_BRAND.ink)
        doc.text(`${formatDate(payment.payment_date)} • ${payment.payment_method}`, margin, noteY)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...PDF_BRAND.muted)
        doc.text(formatCurrency(payment.amount, invoice.currency), margin + noteWidth, noteY, { align: 'right' })
        if (payment.reference) {
          doc.setFontSize(6.8)
          doc.text(`Ref: ${payment.reference}`, margin, noteY + 4.5)
          noteY += 10
        } else {
          noteY += 7
        }
      })
    }
    if (invoice.notes) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...PDF_BRAND.muted)
      doc.text(doc.splitTextToSize(invoice.notes, noteWidth).slice(0, 5), margin, noteY + 2)
    }
  }

  doc.setFillColor(...PDF_BRAND.cream)
  doc.setDrawColor(...PDF_BRAND.line)
  doc.setLineWidth(0.35)
  doc.roundedRect(summaryX, y, summaryWidth, 57, 2.5, 2.5, 'FD')

  const taxable = Number(invoice.subtotal) - Number(invoice.discount_amount)
  const totals: Array<[string, number, boolean?]> = [
    ['Subtotal', Number(invoice.subtotal)],
    ['Discount', Number(invoice.discount_amount), true],
    [`Taxable (${Number(invoice.tax_rate).toFixed(2)}%)`, taxable],
    ['Tax', Number(invoice.tax_amount)],
    ['Invoice total', Number(invoice.total_amount)],
    ['Paid', Number(invoice.paid_amount), true],
  ]

  totals.forEach(([label, value, subtract], index) => {
    const rowY = y + 8 + index * 6.5
    doc.setFont('helvetica', index === 4 ? 'bold' : 'normal')
    doc.setFontSize(index === 4 ? 8.4 : 7.5)
    doc.setTextColor(...(index === 4 ? PDF_BRAND.ink : PDF_BRAND.muted))
    doc.text(label, summaryX + 6, rowY)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...PDF_BRAND.ink)
    const prefix = subtract && value > 0 ? '-' : ''
    doc.text(`${prefix}${formatCurrency(value, invoice.currency)}`, summaryX + summaryWidth - 6, rowY, { align: 'right' })
  })

  doc.setFillColor(...PDF_BRAND.paleGold)
  doc.setDrawColor(...PDF_BRAND.gold)
  doc.roundedRect(summaryX + 4, y + 48, summaryWidth - 8, 12, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.4)
  doc.setTextColor(...PDF_BRAND.darkGold)
  doc.text('BALANCE DUE', summaryX + 8, y + 55.2)
  doc.setFont('times', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...PDF_BRAND.ink)
  doc.text(formatCurrency(invoice.balance_amount, invoice.currency), summaryX + summaryWidth - 8, y + 55.5, { align: 'right' })

  addAllPageFooters(
    doc,
    `Prepared by: ${authorizedBy || 'Aroma Ceylon Administrator'}`,
    `Private business document • Generated ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date())}`,
    `Due: ${formatDate(invoice.due_date)}`,
  )

  return doc.output('blob')
}

export async function createDeliveryNotePdfBlob(
  invoice: SalesInvoicePdfRecord,
  shop: SalesShopPdfRecord,
  items: SalesInvoicePdfItem[],
  authorizedBy: string,
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 16
  const bottomLimit = pageHeight - 42
  let logo: string | null = null

  try {
    logo = await loadPdfLogoDataUrl()
  } catch {
    logo = null
  }

  let y = addPageHeader(
    doc,
    'DELIVERY NOTE',
    `${invoice.invoice_code} • ${invoice.delivery_date ? formatDate(invoice.delivery_date) : formatDate(invoice.invoice_date)}`,
    invoice.delivery_status,
    logo,
  )
  y = drawCustomerAndDocumentCards(doc, invoice, shop, y, 'Delivery details')
  drawPdfSectionTitle(doc, 'Delivered products', y)
  y += 7
  y = drawDeliveryTableHeader(doc, y)

  items.forEach((item) => {
    const rowHeight = 12
    if (y + rowHeight > bottomLimit) {
      doc.addPage()
      y = addPageHeader(doc, 'DELIVERY NOTE', invoice.invoice_code, invoice.delivery_status, logo)
      drawPdfSectionTitle(doc, 'Delivered products continued', y)
      y += 7
      y = drawDeliveryTableHeader(doc, y)
    }

    doc.setDrawColor(...PDF_BRAND.line)
    doc.setLineWidth(0.25)
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...PDF_BRAND.ink)
    doc.text(doc.splitTextToSize(item.product_name, 104)[0] || item.product_name, margin + 4, y + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...PDF_BRAND.muted)
    doc.text([item.sku, item.pack_size].filter(Boolean).join(' • '), 155, y + 7, { align: 'right' })
    doc.setFont('times', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...PDF_BRAND.ink)
    doc.text(shortQuantity(item.quantity), pageWidth - margin - 4, y + 7, { align: 'right' })
    y += rowHeight
  })

  if (y + 58 > bottomLimit) {
    doc.addPage()
    y = addPageHeader(doc, 'DELIVERY NOTE', invoice.invoice_code, invoice.delivery_status, logo)
  } else {
    y += 9
  }

  if (invoice.notes) {
    drawPdfSectionTitle(doc, 'Delivery notes', y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...PDF_BRAND.muted)
    doc.text(doc.splitTextToSize(invoice.notes, pageWidth - margin * 2).slice(0, 4), margin, y + 9)
    y += 27
  }

  const gap = 10
  const boxWidth = (pageWidth - margin * 2 - gap) / 2
  doc.setDrawColor(...PDF_BRAND.line)
  doc.setFillColor(...PDF_BRAND.cream)
  doc.roundedRect(margin, y, boxWidth, 29, 2.5, 2.5, 'FD')
  doc.roundedRect(margin + boxWidth + gap, y, boxWidth, 29, 2.5, 2.5, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...PDF_BRAND.darkGold)
  doc.text('RECEIVED BY / SIGNATURE', margin + 6, y + 8)
  doc.text('RECEIVED DATE', margin + boxWidth + gap + 6, y + 8)
  doc.setDrawColor(...PDF_BRAND.muted)
  doc.setLineWidth(0.25)
  doc.line(margin + 6, y + 22, margin + boxWidth - 6, y + 22)
  doc.line(margin + boxWidth + gap + 6, y + 22, pageWidth - margin - 6, y + 22)

  addAllPageFooters(
    doc,
    `Prepared by: ${authorizedBy || 'Aroma Ceylon Administrator'}`,
    'This delivery note intentionally excludes product prices.',
    `Delivery status: ${invoice.delivery_status.replace('_', ' ').toUpperCase()}`,
  )

  return doc.output('blob')
}
