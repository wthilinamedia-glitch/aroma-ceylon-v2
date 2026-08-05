import type { jsPDF } from 'jspdf'
import { drawPdfText } from './pdfText'

export const PDF_BRAND = {
  gold: [184, 132, 31] as [number, number, number],
  darkGold: [136, 91, 18] as [number, number, number],
  ink: [42, 32, 24] as [number, number, number],
  muted: [105, 95, 84] as [number, number, number],
  cream: [250, 247, 239] as [number, number, number],
  paleGold: [248, 238, 208] as [number, number, number],
  line: [225, 214, 194] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
}

export async function loadPdfLogoDataUrl(url = '/aroma-logo.png') {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Unable to load the PDF logo.')
  const blob = await response.blob()

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error('Unable to read the PDF logo.'))
    reader.readAsDataURL(blob)
  })
}

function statusStyle(status: string) {
  const normalized = status.trim().toLowerCase()
  if (normalized === 'paid' || normalized === 'ගෙවා ඇත' || normalized.includes('ලැබී ඇත')) {
    return {
      fill: [229, 242, 231] as [number, number, number],
      stroke: [80, 132, 83] as [number, number, number],
      text: [47, 105, 53] as [number, number, number],
    }
  }

  if (normalized === 'overdue' || normalized === 'unpaid' || normalized === 'ගෙවීම් කල් ඉකුත්' || normalized === 'ගෙවා නැත') {
    return {
      fill: [250, 233, 229] as [number, number, number],
      stroke: [169, 79, 58] as [number, number, number],
      text: [143, 58, 41] as [number, number, number],
    }
  }

  return {
    fill: PDF_BRAND.paleGold,
    stroke: PDF_BRAND.gold,
    text: PDF_BRAND.darkGold,
  }
}

export function drawPdfStatusPill(
  doc: jsPDF,
  status: string,
  rightX: number,
  topY: number,
) {
  const label = status.trim().toUpperCase() || 'DRAFT'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  const width = Math.max(
    24,
    /[^\u0000-\u024f]/.test(label)
      ? Math.min(72, Math.max(30, label.length * 2.35 + 10))
      : doc.getTextWidth(label) + 10,
  )
  const style = statusStyle(status)

  doc.setFillColor(...style.fill)
  doc.setDrawColor(...style.stroke)
  doc.setLineWidth(0.35)
  doc.roundedRect(rightX - width, topY, width, 7.5, 3.75, 3.75, 'FD')
  doc.setTextColor(...style.text)
  drawPdfText(doc, label, rightX - width / 2, topY + 5.1, { align: 'center', fontSize: 8, bold: true, color: style.text })

  return width
}

export function addPremiumPdfHeader(
  doc: jsPDF,
  options: {
    title: string
    subtitle: string
    status?: string
    logoDataUrl?: string | null
  },
) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 16

  doc.setFillColor(...PDF_BRAND.white)
  doc.rect(0, 0, pageWidth, 51, 'F')
  doc.setFillColor(...PDF_BRAND.gold)
  doc.rect(0, 0, pageWidth, 3, 'F')

  doc.setFillColor(...PDF_BRAND.cream)
  doc.setDrawColor(...PDF_BRAND.line)
  doc.setLineWidth(0.35)
  doc.roundedRect(margin, 9, 57, 33, 2.5, 2.5, 'FD')

  if (options.logoDataUrl) {
    doc.addImage(options.logoDataUrl, 'PNG', margin + 4.5, 10.5, 48, 30, undefined, 'FAST')
  } else {
    doc.setTextColor(...PDF_BRAND.ink)
    doc.setFont('times', 'bold')
    doc.setFontSize(16)
    doc.text('AROMA CEYLON', margin + 28.5, 25, { align: 'center' })
    doc.setTextColor(...PDF_BRAND.gold)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.text('AUTHENTIC CEYLON SPICES', margin + 28.5, 31, { align: 'center' })
  }

  const right = pageWidth - margin
  doc.setTextColor(...PDF_BRAND.ink)
  doc.setFont('times', 'bold')
  doc.setFontSize(20)
  drawPdfText(doc, options.title, right, 19, { align: 'right', fontSize: 20, bold: true, color: PDF_BRAND.ink, maxWidth: 108 })

  doc.setTextColor(...PDF_BRAND.muted)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  drawPdfText(doc, options.subtitle, right, 27, { align: 'right', fontSize: 9, color: PDF_BRAND.muted, maxWidth: 108 })

  if (options.status) drawPdfStatusPill(doc, options.status, right, 32)

  doc.setDrawColor(...PDF_BRAND.gold)
  doc.setLineWidth(0.55)
  doc.line(margin, 47, pageWidth - margin, 47)

  return 56
}

export function drawPdfSectionTitle(doc: jsPDF, title: string, y: number, x = 16, width?: number) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const lineWidth = width ?? pageWidth - x - 16

  doc.setTextColor(...PDF_BRAND.ink)
  doc.setFont('times', 'bold')
  doc.setFontSize(12.5)
  drawPdfText(doc, title, x, y, { fontSize: 12.5, bold: true, color: PDF_BRAND.ink, maxWidth: lineWidth })
  doc.setDrawColor(...PDF_BRAND.gold)
  doc.setLineWidth(0.45)
  doc.line(x, y + 3, x + lineWidth, y + 3)
}

export function addPremiumPdfFooter(
  doc: jsPDF,
  options: {
    leftTop: string
    leftBottom: string
    rightTop?: string
  },
) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 16

  doc.setDrawColor(...PDF_BRAND.line)
  doc.setLineWidth(0.35)
  doc.line(margin, pageHeight - 28, pageWidth - margin, pageHeight - 28)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...PDF_BRAND.muted)
  drawPdfText(doc, options.leftTop, margin, pageHeight - 20, { fontSize: 7.5, color: PDF_BRAND.muted, maxWidth: 95 })
  drawPdfText(doc, options.leftBottom, margin, pageHeight - 14, { fontSize: 7.5, color: PDF_BRAND.muted, maxWidth: 95 })

  if (options.rightTop) {
    drawPdfText(doc, options.rightTop, pageWidth - margin, pageHeight - 20, { align: 'right', fontSize: 7.5, color: PDF_BRAND.muted, maxWidth: 80 })
  }

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PDF_BRAND.gold)
  doc.text('Aroma Ceylon | Authentic Ceylon Spices', pageWidth - margin, pageHeight - 14, { align: 'right' })
}
