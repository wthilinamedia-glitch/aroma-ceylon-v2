import type { jsPDF } from 'jspdf'

export type PdfTextOptions = {
  align?: 'left' | 'center' | 'right'
  maxWidth?: number
  fontSize?: number
  bold?: boolean
  color?: [number, number, number]
  lineHeight?: number
  maxLines?: number
}

const SINHALA_FONT = '"Noto Sans Sinhala", "Nirmala UI", "Iskoola Pota", sans-serif'

export function hasComplexUnicode(value: string) {
  return /[^\u0000-\u024f\u2000-\u206f\u20a0-\u20cf]/.test(value)
}

function canvasLines(text: string, context: CanvasRenderingContext2D, maxWidthPx?: number) {
  const source = String(text || '').split('\n')
  if (!maxWidthPx) return source
  const lines: string[] = []
  source.forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push('')
      return
    }
    let line = words[0]
    words.slice(1).forEach((word) => {
      const candidate = `${line} ${word}`
      if (context.measureText(candidate).width <= maxWidthPx) line = candidate
      else {
        lines.push(line)
        line = word
      }
    })
    lines.push(line)
  })
  return lines
}

/**
 * jsPDF's built-in fonts do not contain Sinhala glyphs. This helper keeps
 * Latin text as searchable PDF text and rasterizes only complex Unicode text
 * through the browser canvas. It avoids shipping a font file in the app.
 */
export function drawPdfText(
  doc: jsPDF,
  value: string | string[],
  x: number,
  y: number,
  options: PdfTextOptions = {},
) {
  const text = Array.isArray(value) ? value.join('\n') : String(value ?? '')
  const fontSize = options.fontSize ?? 9
  const lineHeightMm = options.lineHeight ?? fontSize * 0.42
  const align = options.align ?? 'left'

  if (!hasComplexUnicode(text) || typeof document === 'undefined') {
    if (options.color) doc.setTextColor(...options.color)
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal')
    doc.setFontSize(fontSize)
    const measured = options.maxWidth ? doc.splitTextToSize(text, options.maxWidth) : text
    const printable = options.maxLines
      ? (Array.isArray(measured) ? measured : String(measured).split('\n')).slice(0, options.maxLines)
      : measured
    doc.text(printable, x, y, { align })
    const count = Array.isArray(printable) ? printable.length : String(printable).split('\n').length
    return count * lineHeightMm
  }

  const scale = 4
  const pxPerMm = 96 / 25.4
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    doc.text(text.replace(/[^\u0000-\u024f]/g, '?'), x, y, { align })
    return lineHeightMm
  }

  const pxFontSize = fontSize * 1.42 * scale
  context.font = `${options.bold ? 700 : 400} ${pxFontSize}px ${SINHALA_FONT}`
  const maxWidthPx = options.maxWidth ? options.maxWidth * pxPerMm * scale : undefined
  const lines = canvasLines(text, context, maxWidthPx).slice(0, options.maxLines || Number.POSITIVE_INFINITY)
  const measured = Math.max(1, ...lines.map((line) => context.measureText(line || ' ').width))
  const padding = 8 * scale
  const lineHeightPx = pxFontSize * 1.35
  canvas.width = Math.ceil(Math.min(maxWidthPx || measured, measured) + padding * 2)
  canvas.height = Math.ceil(lines.length * lineHeightPx + padding * 2)

  const draw = canvas.getContext('2d')
  if (!draw) return lineHeightMm
  draw.clearRect(0, 0, canvas.width, canvas.height)
  draw.font = `${options.bold ? 700 : 400} ${pxFontSize}px ${SINHALA_FONT}`
  draw.textBaseline = 'top'
  const color = options.color ?? [42, 32, 24]
  draw.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`
  lines.forEach((line, index) => draw.fillText(line, padding, padding + index * lineHeightPx))

  const widthMm = canvas.width / (pxPerMm * scale)
  const heightMm = canvas.height / (pxPerMm * scale)
  let left = x
  if (align === 'right') left = x - widthMm
  if (align === 'center') left = x - widthMm / 2
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', left, y - fontSize * 0.36, widthMm, heightMm, undefined, 'FAST')
  return lines.length * lineHeightMm
}
