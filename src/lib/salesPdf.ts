import { jsPDF } from 'jspdf'
import {
  addPremiumPdfFooter,
  addPremiumPdfHeader,
  drawPdfSectionTitle,
  loadPdfLogoDataUrl,
  PDF_BRAND,
} from './pdfBrand'
import { drawPdfText } from './pdfText'


type PdfLanguage = 'en' | 'si'

const PDF_TRANSLATIONS: Record<string, string> = {
  'TAX INVOICE': 'බදු ඉන්වොයිසිය',
  'DELIVERY NOTE': 'භාණ්ඩ භාරදීමේ පත්‍රය',
  'PAYMENT RECEIPT': 'ගෙවීම් ලදුපත',
  'CREDIT NOTE': 'ණය සටහන',
  'BILL TO': 'බිල්පත ලබන්නා',
  'Invoice details': 'ඉන්වොයිස් විස්තර',
  'Delivery details': 'භාරදීමේ විස්තර',
  'Receipt details': 'ලදුපත් විස්තර',
  'Invoice number': 'ඉන්වොයිස් අංකය',
  'Invoice date': 'ඉන්වොයිස් දිනය',
  'Due date': 'ගෙවිය යුතු දිනය',
  'Delivery date': 'භාරදීමේ දිනය',
  'Currency': 'මුදල් ඒකකය',
  'Not set': 'සඳහන් කර නැත',
  'Products & charges': 'නිෂ්පාදන සහ ගාස්තු',
  'Products & charges continued': 'නිෂ්පාදන සහ ගාස්තු - ඉදිරියට',
  'Delivered products': 'භාරදුන් නිෂ්පාදන',
  'Delivered products continued': 'භාරදුන් නිෂ්පාදන - ඉදිරියට',
  'PRODUCT': 'නිෂ්පාදනය',
  'QTY': 'ප්‍රමාණය',
  'UNIT PRICE': 'ඒකක මිල',
  'TOTAL': 'එකතුව',
  'SKU / PACK': 'කේතය / පැකේජය',
  'QUANTITY': 'ප්‍රමාණය',
  'Payment history': 'ගෙවීම් ඉතිහාසය',
  'Invoice notes': 'ඉන්වොයිස් සටහන්',
  'Delivery notes': 'භාරදීමේ සටහන්',
  'Subtotal': 'උප එකතුව',
  'Discount': 'වට්ටම',
  'Tax': 'බදු',
  'Taxable': 'බද්දට යටත් මුදල',
  'Invoice total': 'ඉන්වොයිස් එකතුව',
  'Credit notes': 'ණය සටහන්',
  'Paid': 'ගෙවා ඇත',
  'BALANCE DUE': 'ගෙවීමට ඉතිරි මුදල',
  'RECEIVED BY / SIGNATURE': 'භාරගත් අය / අත්සන',
  'RECEIVED DATE': 'භාරගත් දිනය',
  'Payment received': 'ලැබුණු ගෙවීම',
  'Amount received': 'ලැබුණු මුදල',
  'Payment method': 'ගෙවීම් ක්‍රමය',
  'Reference': 'යොමු අංකය',
  'Payment date': 'ගෙවීම් දිනය',
  'Invoice balance after payment': 'ගෙවීමෙන් පසු ඉතිරි මුදල',
  'Confirmation': 'තහවුරු කිරීම',
  'Customer and reference': 'ගනුදෙනුකරු සහ යොමුව',
  'Customer': 'ගනුදෙනුකරු',
  'Invoice': 'ඉන්වොයිසිය',
  'Credit reference': 'ණය සටහන් අංකය',
  'Reason': 'හේතුව',
  'Credit value': 'ණය මුදල',
  'TOTAL CREDIT': 'මුළු ණය මුදල',
  'Returned products': 'ආපසු ලැබුණු නිෂ්පාදන',
  'Payment information': 'ගෙවීම් තොරතුරු',
  'Notes': 'සටහන්',
  'Prepared by': 'සකස් කළේ',
  'Private business document': 'පෞද්ගලික ව්‍යාපාරික ලේඛනය',
  'Generated': 'සකස් කළ දිනය',
  'Due': 'ගෙවිය යුතු දිනය',
  'This delivery note intentionally excludes product prices.': 'මෙම භාණ්ඩ භාරදීමේ පත්‍රයේ නිෂ්පාදන මිල සඳහන් කර නොමැත.',
  'Delivery status': 'භාරදීමේ තත්ත්වය',
  'This receipt confirms that Aroma Ceylon received the payment shown above.': 'ඉහත සඳහන් ගෙවීම Aroma Ceylon වෙත ලැබුණු බව මෙම ලදුපතෙන් තහවුරු කරයි.',
  'Authorized by': 'අනුමත කළේ',
  'Official payment receipt': 'නිල ගෙවීම් ලදුපත',
  'Official credit note': 'නිල ණය සටහන',
  'Draft': 'කෙටුම්පත',
  'Sent': 'යවා ඇත',
  'Partially paid': 'කොටසක් ගෙවා ඇත',
  'Overdue': 'ගෙවීම් කල් ඉකුත්',
  'Cancelled': 'අවලංගු කර ඇත',
  'Pending': 'බලාපොරොත්තුවෙන්',
  'Packed': 'ඇසුරුම් කර ඇත',
  'Delivered': 'භාරදී ඇත',
  'Received': 'ලැබී ඇත',
  'Refunded': 'ආපසු ගෙවා ඇත',
  'Issued': 'නිකුත් කර ඇත',
  'Cash': 'මුදල්',
  'Bank transfer': 'බැංකු මාරුව',
  'Card': 'කාඩ්පත',
  'Other': 'වෙනත්',
}

function pdfLabel(value: string, language: PdfLanguage) {
  return language === 'si' ? PDF_TRANSLATIONS[value] || value : value
}

function humanStatus(status: string) {
  return status
    .trim()
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function pdfStatus(status: string, language: PdfLanguage) {
  const readable = humanStatus(status)
  return pdfLabel(readable, language)
}

function pdfFooterLabel(label: string, value: string, language: PdfLanguage) {
  return `${pdfLabel(label, language)}: ${value}`
}

function pdfLanguage(shop: SalesShopPdfRecord | { preferred_language?: 'en' | 'si' }): PdfLanguage {
  return shop.preferred_language === 'si' ? 'si' : 'en'
}

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
  credited_amount?: number
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
  preferred_language?: 'en' | 'si'
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
  language: PdfLanguage,
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
  drawPdfText(doc, pdfLabel('BILL TO', language), margin + 6, startY + 8, { fontSize: 7.5, bold: true, color: PDF_BRAND.darkGold, maxWidth: width - 12 })
  drawPdfText(doc, pdfLabel(documentLabel, language), rightX + 6, startY + 8, { fontSize: 7.5, bold: true, color: PDF_BRAND.darkGold, maxWidth: width - 12 })

  doc.setFont('times', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...PDF_BRAND.ink)
  drawPdfText(doc, shop.shop_name || shop.shop_code, margin + 6, startY + 16, { fontSize: 12, bold: true, color: PDF_BRAND.ink, maxWidth: width - 12 })

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
  drawPdfText(doc, customerLines.join('\n'), margin + 6, startY + 23, { fontSize: 8, color: PDF_BRAND.muted, maxWidth: width - 12, lineHeight: 4, maxLines: 5 })

  const rows: Array<[string, string]> = [
    [pdfLabel('Invoice number', language), invoice.invoice_code],
    [pdfLabel('Invoice date', language), formatDate(invoice.invoice_date)],
    [pdfLabel('Due date', language), formatDate(invoice.due_date)],
    [pdfLabel('Delivery date', language), invoice.delivery_date ? formatDate(invoice.delivery_date) : pdfLabel('Not set', language)],
    [pdfLabel('Currency', language), invoice.currency],
  ]

  rows.forEach(([label, value], index) => {
    const rowY = startY + 15 + index * 6.6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...PDF_BRAND.muted)
    drawPdfText(doc, label, rightX + 6, rowY, { fontSize: 7.5, color: PDF_BRAND.muted, maxWidth: 42 })
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...PDF_BRAND.ink)
    drawPdfText(doc, value, rightX + width - 6, rowY, { align: 'right', fontSize: 7.5, bold: true, color: PDF_BRAND.ink, maxWidth: 45 })
  })

  return startY + height + 10
}

function drawInvoiceTableHeader(doc: jsPDF, y: number, language: PdfLanguage) {
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
  drawPdfText(doc, pdfLabel('PRODUCT', language), margin + 4, y + 5.9, { fontSize: 7.5, bold: true, color: PDF_BRAND.darkGold })
  drawPdfText(doc, pdfLabel('QTY', language), 134, y + 5.9, { align: 'right', fontSize: 7.5, bold: true, color: PDF_BRAND.darkGold })
  drawPdfText(doc, pdfLabel('UNIT PRICE', language), 166, y + 5.9, { align: 'right', fontSize: 7.5, bold: true, color: PDF_BRAND.darkGold })
  drawPdfText(doc, pdfLabel('TOTAL', language), pageWidth - margin - 4, y + 5.9, { align: 'right', fontSize: 7.5, bold: true, color: PDF_BRAND.darkGold })
  return y + 9
}

function drawDeliveryTableHeader(doc: jsPDF, y: number, language: PdfLanguage) {
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
  drawPdfText(doc, pdfLabel('PRODUCT', language), margin + 4, y + 5.9, { fontSize: 7.5, bold: true, color: PDF_BRAND.darkGold })
  drawPdfText(doc, pdfLabel('SKU / PACK', language), 155, y + 5.9, { align: 'right', fontSize: 7.5, bold: true, color: PDF_BRAND.darkGold })
  drawPdfText(doc, pdfLabel('QUANTITY', language), pageWidth - margin - 4, y + 5.9, { align: 'right', fontSize: 7.5, bold: true, color: PDF_BRAND.darkGold })
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
  const language = pdfLanguage(shop)
  let logo: string | null = null

  try {
    logo = await loadPdfLogoDataUrl()
  } catch {
    logo = null
  }

  let y = addPageHeader(
    doc,
    pdfLabel('TAX INVOICE', language),
    `${invoice.invoice_code} • ${formatDate(invoice.invoice_date)}`,
    pdfStatus(invoice.status, language),
    logo,
  )
  y = drawCustomerAndDocumentCards(doc, invoice, shop, y, 'Invoice details', language)
  drawPdfSectionTitle(doc, pdfLabel('Products & charges', language), y)
  y += 7
  y = drawInvoiceTableHeader(doc, y, language)

  items.forEach((item) => {
    const rowHeight = 12
    if (y + rowHeight > bottomLimit) {
      doc.addPage()
      y = addPageHeader(doc, pdfLabel('TAX INVOICE', language), invoice.invoice_code, pdfStatus(invoice.status, language), logo)
      drawPdfSectionTitle(doc, pdfLabel('Products & charges continued', language), y)
      y += 7
      y = drawInvoiceTableHeader(doc, y, language)
    }

    doc.setDrawColor(...PDF_BRAND.line)
    doc.setLineWidth(0.25)
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.4)
    doc.setTextColor(...PDF_BRAND.ink)
    drawPdfText(doc, item.product_name, margin + 4, y + 5, { fontSize: 8.4, bold: true, color: PDF_BRAND.ink, maxWidth: 92, maxLines: 1 })
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
    y = addPageHeader(doc, pdfLabel('TAX INVOICE', language), invoice.invoice_code, pdfStatus(invoice.status, language), logo)
  } else {
    y += 7
  }

  const summaryWidth = 78
  const summaryX = pageWidth - margin - summaryWidth
  const noteWidth = summaryX - margin - 8

  if (invoice.notes || payments.length > 0) {
    drawPdfSectionTitle(doc, pdfLabel(payments.length > 0 ? 'Payment information' : 'Notes', language), y, margin, noteWidth)
    let noteY = y + 10
    if (payments.length > 0) {
      payments.slice(0, 4).forEach((payment) => {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.7)
        doc.setTextColor(...PDF_BRAND.ink)
        drawPdfText(doc, `${formatDate(payment.payment_date)} • ${pdfLabel(payment.payment_method, language)}`, margin, noteY, { fontSize: 7.7, bold: true, color: PDF_BRAND.ink, maxWidth: noteWidth - 28, maxLines: 1 })
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...PDF_BRAND.muted)
        doc.text(formatCurrency(payment.amount, invoice.currency), margin + noteWidth, noteY, { align: 'right' })
        if (payment.reference) {
          doc.setFontSize(6.8)
          drawPdfText(doc, `${pdfLabel('Reference', language)}: ${payment.reference}`, margin, noteY + 4.5, { fontSize: 6.8, color: PDF_BRAND.muted, maxWidth: noteWidth })
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
      drawPdfText(doc, invoice.notes, margin, noteY + 2, { fontSize: 7.5, color: PDF_BRAND.muted, maxWidth: noteWidth, lineHeight: 3.4, maxLines: 5 })
    }
  }

  doc.setFillColor(...PDF_BRAND.cream)
  doc.setDrawColor(...PDF_BRAND.line)
  doc.setLineWidth(0.35)
  doc.roundedRect(summaryX, y, summaryWidth, 65, 2.5, 2.5, 'FD')

  const taxable = Number(invoice.subtotal) - Number(invoice.discount_amount)
  const totals: Array<[string, number, boolean?]> = [
    [pdfLabel('Subtotal', language), Number(invoice.subtotal)],
    [pdfLabel('Discount', language), Number(invoice.discount_amount), true],
    [`${pdfLabel('Taxable', language)} (${Number(invoice.tax_rate).toFixed(2)}%)`, taxable],
    [pdfLabel('Tax', language), Number(invoice.tax_amount)],
    [pdfLabel('Invoice total', language), Number(invoice.total_amount)],
    [pdfLabel('Credit notes', language), Number(invoice.credited_amount || 0), true],
    [pdfLabel('Paid', language), Number(invoice.paid_amount), true],
  ]

  totals.forEach(([label, value, subtract], index) => {
    const rowY = y + 7 + index * 6.2
    doc.setFont('helvetica', index === 4 ? 'bold' : 'normal')
    doc.setFontSize(index === 4 ? 8.4 : 7.5)
    doc.setTextColor(...(index === 4 ? PDF_BRAND.ink : PDF_BRAND.muted))
    drawPdfText(doc, label, summaryX + 6, rowY, { fontSize: index === 4 ? 8.4 : 7.5, bold: index === 4, color: index === 4 ? PDF_BRAND.ink : PDF_BRAND.muted, maxWidth: 42 })
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...PDF_BRAND.ink)
    const prefix = subtract && value > 0 ? '-' : ''
    doc.text(`${prefix}${formatCurrency(value, invoice.currency)}`, summaryX + summaryWidth - 6, rowY, { align: 'right' })
  })

  doc.setFillColor(...PDF_BRAND.paleGold)
  doc.setDrawColor(...PDF_BRAND.gold)
  doc.roundedRect(summaryX + 4, y + 56, summaryWidth - 8, 12, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.4)
  doc.setTextColor(...PDF_BRAND.darkGold)
  drawPdfText(doc, pdfLabel('BALANCE DUE', language), summaryX + 8, y + 63.2, { fontSize: 7.4, bold: true, color: PDF_BRAND.darkGold })
  doc.setFont('times', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...PDF_BRAND.ink)
  doc.text(formatCurrency(invoice.balance_amount, invoice.currency), summaryX + summaryWidth - 8, y + 63.5, { align: 'right' })

  addAllPageFooters(
    doc,
    pdfFooterLabel('Prepared by', authorizedBy || 'Aroma Ceylon Administrator', language),
    `${pdfLabel('Private business document', language)} • ${pdfFooterLabel('Generated', new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date()), language)}`,
    pdfFooterLabel('Due', formatDate(invoice.due_date), language),
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
  const language = pdfLanguage(shop)
  let logo: string | null = null

  try {
    logo = await loadPdfLogoDataUrl()
  } catch {
    logo = null
  }

  let y = addPageHeader(
    doc,
    pdfLabel('DELIVERY NOTE', language),
    `${invoice.invoice_code} • ${invoice.delivery_date ? formatDate(invoice.delivery_date) : formatDate(invoice.invoice_date)}`,
    pdfStatus(invoice.delivery_status, language),
    logo,
  )
  y = drawCustomerAndDocumentCards(doc, invoice, shop, y, 'Delivery details', language)
  drawPdfSectionTitle(doc, pdfLabel('Delivered products', language), y)
  y += 7
  y = drawDeliveryTableHeader(doc, y, language)

  items.forEach((item) => {
    const rowHeight = 12
    if (y + rowHeight > bottomLimit) {
      doc.addPage()
      y = addPageHeader(doc, pdfLabel('DELIVERY NOTE', language), invoice.invoice_code, pdfStatus(invoice.delivery_status, language), logo)
      drawPdfSectionTitle(doc, pdfLabel('Delivered products continued', language), y)
      y += 7
      y = drawDeliveryTableHeader(doc, y, language)
    }

    doc.setDrawColor(...PDF_BRAND.line)
    doc.setLineWidth(0.25)
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...PDF_BRAND.ink)
    drawPdfText(doc, item.product_name, margin + 4, y + 5, { fontSize: 8.5, bold: true, color: PDF_BRAND.ink, maxWidth: 104, maxLines: 1 })
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
    y = addPageHeader(doc, pdfLabel('DELIVERY NOTE', language), invoice.invoice_code, pdfStatus(invoice.delivery_status, language), logo)
  } else {
    y += 9
  }

  if (invoice.notes) {
    drawPdfSectionTitle(doc, pdfLabel('Delivery notes', language), y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...PDF_BRAND.muted)
    drawPdfText(doc, invoice.notes, margin, y + 9, { fontSize: 8, color: PDF_BRAND.muted, maxWidth: pageWidth - margin * 2, lineHeight: 3.6, maxLines: 4 })
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
  drawPdfText(doc, pdfLabel('RECEIVED BY / SIGNATURE', language), margin + 6, y + 8, { fontSize: 7.5, bold: true, color: PDF_BRAND.darkGold, maxWidth: boxWidth - 12 })
  drawPdfText(doc, pdfLabel('RECEIVED DATE', language), margin + boxWidth + gap + 6, y + 8, { fontSize: 7.5, bold: true, color: PDF_BRAND.darkGold, maxWidth: boxWidth - 12 })
  doc.setDrawColor(...PDF_BRAND.muted)
  doc.setLineWidth(0.25)
  doc.line(margin + 6, y + 22, margin + boxWidth - 6, y + 22)
  doc.line(margin + boxWidth + gap + 6, y + 22, pageWidth - margin - 6, y + 22)

  addAllPageFooters(
    doc,
    pdfFooterLabel('Prepared by', authorizedBy || 'Aroma Ceylon Administrator', language),
    pdfLabel('This delivery note intentionally excludes product prices.', language),
    pdfFooterLabel('Delivery status', pdfStatus(invoice.delivery_status, language), language),
  )

  return doc.output('blob')
}

export async function createPaymentReceiptPdfBlob(
  invoice: SalesInvoicePdfRecord,
  shop: SalesShopPdfRecord,
  payment: SalesInvoicePdfPayment & { id?: string; exchange_rate_lkr?: number },
  authorizedBy: string,
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 16
  const language = pdfLanguage(shop)
  let logo: string | null = null
  try { logo = await loadPdfLogoDataUrl() } catch { logo = null }

  let y = addPremiumPdfHeader(doc, {
    title: pdfLabel('PAYMENT RECEIPT', language),
    subtitle: `${invoice.invoice_code} • ${formatDate(payment.payment_date)}`,
    status: `${pdfLabel('Paid', language)} / ${pdfLabel('Received', language)}`,
    logoDataUrl: logo,
  })

  y = drawCustomerAndDocumentCards(doc, invoice, shop, y, 'Receipt details', language)
  drawPdfSectionTitle(doc, pdfLabel('Payment received', language), y)
  y += 10

  doc.setFillColor(...PDF_BRAND.cream)
  doc.setDrawColor(...PDF_BRAND.gold)
  doc.setLineWidth(0.45)
  doc.roundedRect(margin, y, pageWidth - margin * 2, 49, 3, 3, 'FD')

  const rows: Array<[string, string]> = [
    [pdfLabel('Amount received', language), formatCurrency(payment.amount, invoice.currency)],
    [pdfLabel('Payment method', language), pdfLabel(payment.payment_method, language)],
    [pdfLabel('Reference', language), payment.reference || '—'],
    [pdfLabel('Payment date', language), formatDate(payment.payment_date)],
    [pdfLabel('Invoice balance after payment', language), formatCurrency(invoice.balance_amount, invoice.currency)],
  ]
  rows.forEach(([label, value], index) => {
    const rowY = y + 9 + index * 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...PDF_BRAND.muted)
    drawPdfText(doc, label, margin + 7, rowY, { fontSize: 8, color: PDF_BRAND.muted, maxWidth: 72 })
    doc.setFont(index === 0 ? 'times' : 'helvetica', 'bold')
    doc.setFontSize(index === 0 ? 14 : 8.5)
    doc.setTextColor(...(index === 0 ? PDF_BRAND.darkGold : PDF_BRAND.ink))
    drawPdfText(doc, value, pageWidth - margin - 7, rowY, { align: 'right', fontSize: index === 0 ? 14 : 8.5, bold: true, color: index === 0 ? PDF_BRAND.darkGold : PDF_BRAND.ink, maxWidth: 84 })
  })

  y += 61
  drawPdfSectionTitle(doc, pdfLabel('Confirmation', language), y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...PDF_BRAND.muted)
  drawPdfText(doc, pdfLabel('This receipt confirms that Aroma Ceylon received the payment shown above.', language), margin, y + 11, { fontSize: 8.5, color: PDF_BRAND.muted, maxWidth: pageWidth - margin * 2 })
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PDF_BRAND.ink)
  drawPdfText(doc, pdfFooterLabel('Authorized by', authorizedBy, language), margin, y + 22, { fontSize: 8.5, bold: true, color: PDF_BRAND.ink, maxWidth: pageWidth - margin * 2 })

  addAllPageFooters(doc, 'Aroma Ceylon • Authentic Ceylon Spices', pdfLabel('Official payment receipt', language), invoice.invoice_code)
  return doc.output('blob')
}

export async function createCreditNotePdfBlob(
  credit: { credit_code: string; amount: number; reason: string; status: string; created_at: string },
  invoice: { invoice_code: string; currency: string },
  shop: { shop_name: string; shop_code?: string; preferred_language?: 'en' | 'si' },
  items: Array<{ product_name: string; sku: string; pack_size?: string | null; quantity: number; unit_price: number; line_total: number }> = [],
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()
  const margin = 16
  const language = pdfLanguage(shop)
  let logo: string | null = null
  try { logo = await loadPdfLogoDataUrl() } catch { logo = null }

  let y = addPremiumPdfHeader(doc, {
    title: pdfLabel('CREDIT NOTE', language),
    subtitle: `${invoice.invoice_code} • ${formatDate(credit.created_at)}`,
    status: pdfStatus(credit.status, language),
    logoDataUrl: logo,
  })
  drawPdfSectionTitle(doc, pdfLabel('Customer and reference', language), y)
  y += 10
  doc.setFillColor(...PDF_BRAND.cream)
  doc.setDrawColor(...PDF_BRAND.gold)
  doc.roundedRect(margin, y, width - margin * 2, 38, 3, 3, 'FD')
  const rows: Array<[string, string]> = [
    [pdfLabel('Customer', language), shop.shop_name],
    [pdfLabel('Invoice', language), invoice.invoice_code],
    [pdfLabel('Credit reference', language), credit.credit_code],
    [pdfLabel('Reason', language), credit.reason],
  ]
  rows.forEach(([label, value], index) => {
    const rowY = y + 8 + index * 8
    drawPdfText(doc, label, margin + 7, rowY, { fontSize: 8, color: PDF_BRAND.muted, maxWidth: 65 })
    drawPdfText(doc, value, width - margin - 7, rowY, { align: 'right', fontSize: 8.5, bold: true, color: PDF_BRAND.ink, maxWidth: 105 })
  })
  y += 52

  if (items.length > 0) {
    drawPdfSectionTitle(doc, pdfLabel('Returned products', language), y)
    y += 9
    items.forEach((item) => {
      doc.setDrawColor(...PDF_BRAND.line)
      doc.line(margin, y + 8, width - margin, y + 8)
      drawPdfText(doc, item.product_name, margin + 3, y + 5, { fontSize: 8, bold: true, color: PDF_BRAND.ink, maxWidth: 94, maxLines: 1 })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...PDF_BRAND.muted)
      doc.text(`${shortQuantity(item.quantity)} × ${formatCurrency(item.unit_price, invoice.currency)}`, width - margin - 3, y + 5, { align: 'right' })
      y += 9
    })
    y += 5
  }

  drawPdfSectionTitle(doc, pdfLabel('Credit value', language), y)
  y += 11
  doc.setFillColor(...PDF_BRAND.paleGold)
  doc.setDrawColor(...PDF_BRAND.gold)
  doc.roundedRect(margin, y, width - margin * 2, 24, 3, 3, 'FD')
  drawPdfText(doc, pdfLabel('TOTAL CREDIT', language), margin + 8, y + 14, { fontSize: 9, bold: true, color: PDF_BRAND.darkGold })
  doc.setFont('times', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...PDF_BRAND.ink)
  doc.text(formatCurrency(credit.amount, invoice.currency), width - margin - 8, y + 15, { align: 'right' })
  addAllPageFooters(doc, 'Aroma Ceylon • Authentic Ceylon Spices', pdfLabel('Official credit note', language), invoice.invoice_code)
  return doc.output('blob')
}
