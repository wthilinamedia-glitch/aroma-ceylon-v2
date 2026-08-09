import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Session } from '@supabase/supabase-js'
import { jsPDF } from 'jspdf'
import { supabase } from './lib/supabase'
import { addPremiumPdfFooter, addPremiumPdfHeader, drawPdfSectionTitle, loadPdfLogoDataUrl, PDF_BRAND } from './lib/pdfBrand'
import { drawPdfText } from './lib/pdfText'
import { SalesManager } from './SalesManager'
import { MessagesCenter } from './MessagesCenter'
import { OperationsHub } from './OperationsHub'
import { type AppLanguage, t, useAutoTranslate } from './i18n'
import brandLogoUrl from './assets/aroma-logo.png'
import appIconUrl from './assets/icon-192.png'
import {
  consumeAndroidPendingPayrollId,
  consumeAndroidPendingThreadId,
  consumeAndroidPendingView,
  disableCurrentAndroidPushDevice,
  isAndroidApp,
  openAndroidNotificationSettings,
  useAndroidPushRegistration,
} from './androidBridge'
type Role = 'admin' | 'user'
type ExpenseStatus = 'pending' | 'approved' | 'rejected'
type View = 'dashboard' | 'income' | 'expense' | 'approvals' | 'transactions' | 'employees' | 'attendance' | 'payroll' | 'products' | 'shops' | 'sales' | 'messages' | 'inventory' | 'reports' | 'payslips' | 'profile'

type Profile = {
  id: string
  full_name: string
  email: string | null
  role: Role
  active: boolean
  job_title: string | null
  phone: string | null
  monthly_salary: number
  salary_currency: string
  preferred_language?: AppLanguage
}

type IncomeRecord = {
  id: string
  store_name: string
  received_date: string
  amount_eur: number
  exchange_rate: number
  amount_lkr: number
  note: string | null
  created_by: string
  created_at: string
  source_type?: string | null
  source_id?: string | null
  source_currency?: string | null
  source_amount?: number | null
}

type ReversePaymentResult = {
  payment_id: string
  invoice_id: string
  invoice_code: string
  receipt_pdf_path: string | null
  invoice_pdf_path: string | null
}

type ExpenseRecord = {
  id: string
  title: string
  category: string
  amount_lkr: number
  expense_date: string
  note: string | null
  bill_path: string | null
  status: ExpenseStatus
  submitted_by: string
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  created_at: string
  source_type?: string | null
  source_id?: string | null
}

type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'leave'

type AttendanceRecord = {
  id: string
  employee_id: string
  work_date: string
  status: AttendanceStatus
  note: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

type PayrollStatus = 'draft' | 'finalized' | 'paid'

type PayrollRecord = {
  id: string
  employee_id: string
  period_start: string
  currency: string
  exchange_rate_lkr?: number
  basic_salary: number
  bonus: number
  allowance: number
  deductions: number
  advance: number
  net_salary: number
  working_days: number
  present_days: number
  half_day_days: number
  absent_days: number
  leave_days: number
  status: PayrollStatus
  payslip_path: string | null
  notes: string | null
  created_by: string
  finalized_by: string | null
  finalized_at: string | null
  paid_at: string | null
  created_at?: string
  updated_at?: string
}

type ProductRecord = {
  id: string
  name: string
  sku: string
  category: string
  pack_size: string | null
  selling_price: number
  cost_price: number | null
  currency: string
  description: string | null
  photo_path: string | null
  active: boolean
  created_by: string
  created_at: string
  updated_at: string
  stock_quantity?: number
  reorder_level?: number
}

type ShopRecord = {
  id: string
  shop_number: number
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
  notes: string | null
  active: boolean
  created_by: string
  created_at: string
  updated_at: string
  preferred_language?: AppLanguage
  default_tax_rate?: number
  default_discount?: number
  preferred_payment_method?: string
}

type CompressedImage = {
  blob: Blob
  extension: 'jpg'
  contentType: 'image/jpeg'
  originalBytes: number
  compressedBytes: number
}

type EditableTransaction =
  | { kind: 'income'; record: IncomeRecord }
  | { kind: 'expense'; record: ExpenseRecord }

const expenseCategories = [
  'Packaging',
  'Ingredients',
  'Labels & Printing',
  'Transport',
  'Import / Customs',
  'Marketing',
  'Equipment',
  'Salary / Staff',
  'Other',
]

const productCategories = [
  'Chilli Products',
  'Curry Powders',
  'Pepper Products',
  'Spice Mixes',
  'Whole Spices',
  'Other',
]

function localIsoDate() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function formatLKR(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 2,
  }).format(Number(value || 0))
}

function formatEUR(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(Number(value || 0))
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

function currentMonthValue() {
  return localIsoDate().slice(0, 7)
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value.slice(0, 7)}-01T12:00:00`))
}


function safeFilePart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'employee'
}

const PAYSLIP_SINHALA: Record<string, string> = {
  'EMPLOYEE PAYSLIP': 'සේවක වැටුප් පත්‍රය',
  'Employee': 'සේවකයා',
  'Email': 'ඊමේල්',
  'Job title': 'රැකියා තනතුර',
  'Pay period': 'වැටුප් කාලය',
  'Attendance summary': 'පැමිණීමේ සාරාංශය',
  'Working days': 'වැඩ කරන දින',
  'Present': 'පැමිණි දින',
  'Half days': 'අර්ධ දින',
  'Absent': 'නොපැමිණි දින',
  'Leave': 'නිවාඩු',
  'Earnings': 'ආදායම්',
  'Deductions': 'අඩු කිරීම්',
  'Basic salary': 'මූලික වැටුප',
  'Bonus': 'ප්‍රසාද දීමනාව',
  'Allowance': 'දීමනා',
  'Gross earnings': 'මුළු ආදායම',
  'Other deductions': 'වෙනත් අඩු කිරීම්',
  'Salary advance': 'වැටුප් අත්තිකාරම',
  'Other': 'වෙනත්',
  'Total deductions': 'මුළු අඩු කිරීම්',
  'NET SALARY': 'ශුද්ධ වැටුප',
  'PAYROLL NOTE': 'වැටුප් සටහන',
  'Gross': 'දළ ආදායම',
  'Authorized by': 'අනුමත කළේ',
  'Generated': 'සකස් කළ දිනය',
  'Paid': 'ගෙවා ඇත',
  'Status': 'තත්ත්වය',
  'Finalized': 'අවසන් කර ඇත',
  'Draft': 'කෙටුම්පත',
  'Not set': 'සඳහන් කර නැත',
}

function payslipLabel(value: string, language: AppLanguage) {
  return language === 'si' ? PAYSLIP_SINHALA[value] || value : value
}

function payslipStatus(value: string, language: AppLanguage) {
  const readable = value
    .trim()
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
  return payslipLabel(readable, language)
}

async function createPayslipPdfBlob(
  payroll: PayrollRecord,
  employee: Profile,
  authorizedBy: string,
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 16
  const language: AppLanguage = employee.preferred_language === 'si' ? 'si' : 'en'
  let logo: string | null = null

  try {
    logo = await loadPdfLogoDataUrl()
  } catch {
    logo = null
  }

  let y = addPremiumPdfHeader(doc, {
    title: payslipLabel('EMPLOYEE PAYSLIP', language),
    subtitle: formatMonth(payroll.period_start),
    status: payslipStatus(payroll.status, language),
    logoDataUrl: logo,
  })

  const cardWidth = pageWidth - margin * 2
  doc.setFillColor(...PDF_BRAND.cream)
  doc.setDrawColor(...PDF_BRAND.line)
  doc.setLineWidth(0.35)
  doc.roundedRect(margin, y, cardWidth, 34, 2.5, 2.5, 'FD')

  const detailColumns = [
    {
      x: margin + 7,
      rows: [
        [payslipLabel('Employee', language), employee.full_name || employee.email || 'Team member'],
        [payslipLabel('Email', language), employee.email || payslipLabel('Not set', language)],
      ],
    },
    {
      x: pageWidth / 2 + 4,
      rows: [
        [payslipLabel('Job title', language), employee.job_title || payslipLabel('Not set', language)],
        [payslipLabel('Pay period', language), formatMonth(payroll.period_start)],
      ],
    },
  ]

  detailColumns.forEach((column) => {
    column.rows.forEach(([label, value], index) => {
      const rowY = y + 10 + index * 13
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...PDF_BRAND.muted)
      drawPdfText(doc, label, column.x, rowY, { fontSize: 7.5, bold: true, color: PDF_BRAND.muted, maxWidth: 72 })
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...PDF_BRAND.ink)
      const safeValue = String(value || payslipLabel('Not set', language))
      drawPdfText(doc, safeValue, column.x, rowY + 5, { fontSize: 10, bold: true, color: PDF_BRAND.ink, maxWidth: 72, maxLines: 1 })
    })
  })
  y += 44

  drawPdfSectionTitle(doc, payslipLabel('Attendance summary', language), y)
  y += 8
  doc.setFillColor(...PDF_BRAND.white)
  doc.setDrawColor(...PDF_BRAND.line)
  doc.roundedRect(margin, y, cardWidth, 31, 2.5, 2.5, 'FD')

  const attendanceItems = [
    [payslipLabel('Working days', language), payroll.working_days],
    [payslipLabel('Present', language), payroll.present_days],
    [payslipLabel('Half days', language), payroll.half_day_days],
    [payslipLabel('Absent', language), payroll.absent_days],
    [payslipLabel('Leave', language), payroll.leave_days],
  ]
  const attendanceColumnWidth = cardWidth / attendanceItems.length
  attendanceItems.forEach(([label, value], index) => {
    const centerX = margin + attendanceColumnWidth * index + attendanceColumnWidth / 2
    if (index > 0) {
      doc.setDrawColor(...PDF_BRAND.line)
      doc.setLineWidth(0.25)
      doc.line(margin + attendanceColumnWidth * index, y + 6, margin + attendanceColumnWidth * index, y + 25)
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...PDF_BRAND.muted)
    drawPdfText(doc, String(label), centerX, y + 10, { align: 'center', fontSize: 7.5, color: PDF_BRAND.muted, maxWidth: attendanceColumnWidth - 3 })
    doc.setFont('times', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...PDF_BRAND.ink)
    doc.text(String(value), centerX, y + 22, { align: 'center' })
  })
  y += 43

  const gap = 8
  const blockWidth = (cardWidth - gap) / 2
  const rightX = margin + blockWidth + gap
  drawPdfSectionTitle(doc, payslipLabel('Earnings', language), y, margin, blockWidth)
  drawPdfSectionTitle(doc, payslipLabel('Deductions', language), y, rightX, blockWidth)
  y += 8

  function drawMoneyCard(
    x: number,
    rows: Array<[string, number, boolean?]>,
    totalLabel: string,
    total: number,
  ) {
    doc.setFillColor(...PDF_BRAND.white)
    doc.setDrawColor(...PDF_BRAND.line)
    doc.roundedRect(x, y, blockWidth, 45, 2.5, 2.5, 'FD')

    rows.forEach(([label, amount, negative], index) => {
      const rowY = y + 10 + index * 9
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...PDF_BRAND.muted)
      drawPdfText(doc, label, x + 6, rowY, { fontSize: 8.5, color: PDF_BRAND.muted, maxWidth: blockWidth * 0.52 })
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...PDF_BRAND.ink)
      const prefix = negative && amount ? '-' : ''
      doc.text(`${prefix}${formatCurrency(amount, payroll.currency)}`, x + blockWidth - 6, rowY, { align: 'right' })
    })

    doc.setDrawColor(...PDF_BRAND.line)
    doc.line(x + 6, y + 32, x + blockWidth - 6, y + 32)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...PDF_BRAND.darkGold)
    drawPdfText(doc, totalLabel, x + 6, y + 40, { fontSize: 8.5, bold: true, color: PDF_BRAND.darkGold, maxWidth: blockWidth * 0.52 })
    doc.text(formatCurrency(total, payroll.currency), x + blockWidth - 6, y + 40, { align: 'right' })
  }

  const gross = Number(payroll.basic_salary) + Number(payroll.bonus) + Number(payroll.allowance)
  const totalDeductions = Number(payroll.deductions) + Number(payroll.advance)
  drawMoneyCard(
    margin,
    [
      [payslipLabel('Basic salary', language), Number(payroll.basic_salary)],
      [payslipLabel('Bonus', language), Number(payroll.bonus)],
      [payslipLabel('Allowance', language), Number(payroll.allowance)],
    ],
    payslipLabel('Gross earnings', language),
    gross,
  )
  drawMoneyCard(
    rightX,
    [
      [payslipLabel('Other deductions', language), Number(payroll.deductions), true],
      [payslipLabel('Salary advance', language), Number(payroll.advance), true],
      [payslipLabel('Other', language), 0, true],
    ],
    payslipLabel('Total deductions', language),
    totalDeductions,
  )
  y += 56

  doc.setFillColor(...PDF_BRAND.paleGold)
  doc.setDrawColor(...PDF_BRAND.gold)
  doc.setLineWidth(0.6)
  doc.roundedRect(margin, y, cardWidth, 29, 3, 3, 'FD')
  doc.setTextColor(...PDF_BRAND.darkGold)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  drawPdfText(doc, payslipLabel('NET SALARY', language), margin + 8, y + 10, { fontSize: 9, bold: true, color: PDF_BRAND.darkGold, maxWidth: 75 })
  doc.setFont('times', 'bold')
  doc.setFontSize(21)
  doc.setTextColor(...PDF_BRAND.ink)
  doc.text(formatCurrency(Number(payroll.net_salary), payroll.currency), pageWidth - margin - 8, y + 19, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...PDF_BRAND.muted)
  drawPdfText(
    doc,
    `${payslipLabel('Gross', language)} ${formatCurrency(gross, payroll.currency)} | ${payslipLabel('Deductions', language)} ${formatCurrency(totalDeductions, payroll.currency)}`,
    margin + 8,
    y + 20,
    { fontSize: 7.5, color: PDF_BRAND.muted, maxWidth: cardWidth - 16 },
  )
  y += 40

  if (payroll.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...PDF_BRAND.darkGold)
    drawPdfText(doc, payslipLabel('PAYROLL NOTE', language), margin, y, { fontSize: 8, bold: true, color: PDF_BRAND.darkGold })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...PDF_BRAND.muted)
    drawPdfText(doc, payroll.notes, margin, y + 6, { fontSize: 8, color: PDF_BRAND.muted, maxWidth: cardWidth, lineHeight: 3.6, maxLines: 3 })
  }

  addPremiumPdfFooter(doc, {
    leftTop: `${payslipLabel('Authorized by', language)}: ${authorizedBy || 'Aroma Ceylon Administrator'}`,
    leftBottom: `${payslipLabel('Generated', language)}: ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`,
    rightTop: payroll.paid_at
      ? `${payslipLabel('Paid', language)}: ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(payroll.paid_at))}`
      : `${payslipLabel('Status', language)}: ${payslipStatus(payroll.status, language)}`,
  })

  // Keep a clean white page through the footer and avoid accidental overflow.
  doc.setDrawColor(...PDF_BRAND.white)
  doc.line(0, pageHeight - 1, pageWidth, pageHeight - 1)

  return doc.output('blob')
}

async function downloadPrivatePayslip(payroll: PayrollRecord, employeeName: string) {
  if (!payroll.payslip_path) throw new Error('This payslip PDF is not available yet.')

  const fileName = `Aroma_Ceylon_Payslip_${safeFilePart(employeeName)}_${payroll.period_start.slice(0, 7)}.pdf`
  const { data, error } = await supabase.storage
    .from('payslips')
    .createSignedUrl(payroll.payslip_path, 120, { download: fileName })

  if (error) throw error
  const link = document.createElement('a')
  link.href = data.signedUrl
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function datesForMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const totalDays = new Date(year, monthNumber, 0).getDate()
  return Array.from({ length: totalDays }, (_, index) => {
    const day = String(index + 1).padStart(2, '0')
    return `${month}-${day}`
  })
}

function attendanceLabel(status: AttendanceStatus) {
  if (status === 'half_day') return 'Half day'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function compressUploadImage(file: File): Promise<CompressedImage> {
  const targetBytes = 700 * 1024
  const initialMaxDimension = 1280

  const source = await createImageBitmap(file)
  let scale = Math.min(1, initialMaxDimension / Math.max(source.width, source.height))
  let width = Math.max(1, Math.round(source.width * scale))
  let height = Math.max(1, Math.round(source.height * scale))

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    source.close()
    throw new Error('Unable to prepare the image.')
  }

  const render = () => {
    canvas.width = width
    canvas.height = height
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(source, 0, 0, width, height)
  }

  const toJpeg = (quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))

  render()
  let blob: Blob | null = null
  const qualities = [0.72, 0.62, 0.52, 0.42, 0.34]

  for (let resizeAttempt = 0; resizeAttempt < 5; resizeAttempt += 1) {
    for (const quality of qualities) {
      blob = await toJpeg(quality)
      if (blob && blob.size <= targetBytes) break
    }
    if (blob && blob.size <= targetBytes) break

    const resizeScale = Math.max(640 / Math.max(width, height), 0.78)
    width = Math.max(1, Math.round(width * resizeScale))
    height = Math.max(1, Math.round(height * resizeScale))
    render()
  }

  source.close()
  if (!blob) throw new Error('Unable to compress the image.')
  if (blob.size > 1_500_000) {
    throw new Error('The photo is still too large. Please crop it and try again.')
  }

  return {
    blob,
    extension: 'jpg',
    contentType: 'image/jpeg',
    originalBytes: file.size,
    compressedBytes: blob.size,
  }
}

function StatusBadge({ status }: { status: ExpenseStatus }) {
  return <span className={`status-badge ${status}`}>{status}</span>
}


function PasswordSetupScreen({
  onComplete,
  mode = 'invite',
}: {
  onComplete: () => void
  mode?: 'invite' | 'recovery'
}) {
  const [language, setLanguage] = useState<AppLanguage>(() => localStorage.getItem('aroma-login-language') === 'si' ? 'si' : 'en')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useAutoTranslate(language)

  function changeAuthLanguage(next: AppLanguage) {
    setLanguage(next)
    localStorage.setItem('aroma-login-language', next)
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    setMessage('')

    if (password.length < 8) {
      setMessage('Use at least 8 characters for the password.')
      return
    }
    if (password !== confirmPassword) {
      setMessage('The passwords do not match.')
      return
    }

    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)

    if (error) {
      setMessage(error.message)
      return
    }

    window.history.replaceState({}, document.title, window.location.pathname)
    onComplete()
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <label className="auth-language-select">
          <span>{t('Language', language)}</span>
          <select value={language} onChange={(event) => changeAuthLanguage(event.target.value as AppLanguage)}>
            <option value="en">English</option>
            <option value="si">සිංහල</option>
          </select>
        </label>
        <img className="brand-logo" src={brandLogoUrl} alt="Aroma Ceylon" />
        <div className="brand-divider" />
        <p className="eyebrow">
  {mode === 'recovery' ? 'PASSWORD RECOVERY' : 'EMPLOYEE INVITATION'}
</p>

<h1>
  {mode === 'recovery' ? 'Create a new password' : 'Create your password'}
</h1>

<p className="muted">
  {mode === 'recovery'
    ? 'Set a new secure password for your Aroma Ceylon account.'
    : 'Set a secure password to finish activating your Aroma Ceylon account.'}
</p>

        <form onSubmit={savePassword} className="login-form">
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
          {message && <p className="error-message">{message}</p>}
          <button className="primary-button" disabled={busy} type="submit">
  {busy
    ? 'Saving…'
    : mode === 'recovery'
      ? 'Update password'
      : 'Activate account'}
</button>
        </form>
      </section>
    </main>
  )
}

function LoginScreen() {
  const [language, setLanguage] = useState<AppLanguage>(() => localStorage.getItem('aroma-login-language') === 'si' ? 'si' : 'en')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useAutoTranslate(language)

  function changeAuthLanguage(next: AppLanguage) {
    setLanguage(next)
    localStorage.setItem('aroma-login-language', next)
  }

  async function login(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage(error.message)
    setBusy(false)
  }
  async function forgotPassword() {
  if (!email.trim()) {
    setMessage('Enter your email address first.')
    return
  }

  setBusy(true)
  setMessage('')

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/`,
  })

  setBusy(false)

  if (error) {
    setMessage(error.message)
    return
  }

  setMessage('Password reset link sent. Please check your email.')
}
  return (
    <main className="auth-page">
      <section className="auth-card">
        <label className="auth-language-select">
          <span>{t('Language', language)}</span>
          <select value={language} onChange={(event) => changeAuthLanguage(event.target.value as AppLanguage)}>
            <option value="en">English</option>
            <option value="si">සිංහල</option>
          </select>
        </label>
        <img className="brand-logo" src={brandLogoUrl} alt="Aroma Ceylon" />
        <div className="brand-divider" />
        <p className="eyebrow">BUSINESS MANAGEMENT</p>
        <h1>Welcome back</h1>
        <p className="muted">Secure access for Aroma Ceylon administrators and team members.</p>

        <form onSubmit={login} className="login-form">
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <button
  type="button"
  onClick={forgotPassword}
  disabled={busy}
  style={{
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    textDecoration: 'underline',
    alignSelf: 'flex-end',
  }}
>
  Forgot password?
</button>

          {message && <p className="error-message">{message}</p>}

          <button className="primary-button" disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}

function IncomeForm({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [storeName, setStoreName] = useState('')
  const [receivedDate, setReceivedDate] = useState(localIsoDate())
  const [amountEur, setAmountEur] = useState('')
  const [exchangeRate, setExchangeRate] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [rateBusy, setRateBusy] = useState(false)
  const [message, setMessage] = useState('')

  const converted = Number(amountEur || 0) * Number(exchangeRate || 0)

  async function fetchRate() {
    setRateBusy(true)
    setMessage('')
    try {
      const response = await fetch(
        `https://api.frankfurter.dev/v2/rate/EUR/LKR?date=${encodeURIComponent(receivedDate)}`,
      )
      if (!response.ok) throw new Error('Exchange rate is unavailable for this date.')
      const data = (await response.json()) as { rate?: number; date?: string }
      if (!data.rate || data.rate <= 0) throw new Error('Invalid exchange rate received.')
      setExchangeRate(data.rate.toFixed(4))
      setMessage(`Rate loaded for ${data.date || receivedDate}. You can edit it manually.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to get the exchange rate.')
    } finally {
      setRateBusy(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    const euro = Number(amountEur)
    const rate = Number(exchangeRate)
    if (!storeName.trim() || euro <= 0 || rate <= 0) {
      setMessage('Please enter the store, EUR amount and exchange rate.')
      setBusy(false)
      return
    }

    const { error } = await supabase.from('income').insert({
      store_name: storeName.trim(),
      received_date: receivedDate,
      amount_eur: euro,
      exchange_rate: rate,
      note: note.trim() || null,
      created_by: profile.id,
    })

    if (error) {
      setMessage(error.message)
    } else {
      setStoreName('')
      setAmountEur('')
      setExchangeRate('')
      setNote('')
      setReceivedDate(localIsoDate())
      setMessage('Income saved successfully.')
      onSaved()
    }
    setBusy(false)
  }

  return (
    <section className="content-card form-card">
      <div className="card-title-row">
        <div>
          <p className="eyebrow">ADMIN ENTRY</p>
          <h2>Add income</h2>
        </div>
        <span className="gold-pill">EUR → LKR</span>
      </div>

      <form className="business-form" onSubmit={submit}>
        <label className="full-field">
          Store / customer
          <input value={storeName} onChange={(event) => setStoreName(event.target.value)} required />
        </label>

        <div className="form-grid">
          <label>
            Received date
            <input
              type="date"
              value={receivedDate}
              onChange={(event) => {
                setReceivedDate(event.target.value)
                setExchangeRate('')
              }}
              required
            />
          </label>
          <label>
            Amount received (€)
            <input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amountEur}
              onChange={(event) => setAmountEur(event.target.value)}
              required
            />
          </label>
        </div>

        <div className="rate-grid">
          <label>
            EUR → LKR exchange rate
            <input
              type="number"
              min="0.0001"
              step="0.0001"
              inputMode="decimal"
              value={exchangeRate}
              onChange={(event) => setExchangeRate(event.target.value)}
              required
            />
          </label>
          <button className="secondary-button" type="button" onClick={fetchRate} disabled={rateBusy}>
            {rateBusy ? 'Loading…' : 'Get date rate'}
          </button>
        </div>

        <label className="full-field">
          Note (optional)
          <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>

        <div className="calculation-box">
          <span>Calculated income in LKR</span>
          <strong>{formatLKR(converted)}</strong>
        </div>

        {message && <p className={message.includes('successfully') ? 'success-message' : 'form-message'}>{message}</p>}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save income'}
        </button>
      </form>
    </section>
  )
}

function ExpenseForm({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(expenseCategories[0])
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(localIsoDate())
  const [note, setNote] = useState('')
  const [bill, setBill] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [compressionInfo, setCompressionInfo] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setCompressionInfo('')

    const numericAmount = Number(amount)
    if (!title.trim() || numericAmount <= 0) {
      setMessage('Please enter an expense name and valid amount.')
      setBusy(false)
      return
    }

    const { data: created, error: insertError } = await supabase
      .from('expenses')
      .insert({
        title: title.trim(),
        category,
        amount_lkr: numericAmount,
        expense_date: expenseDate,
        note: note.trim() || null,
        status: 'pending',
        submitted_by: profile.id,
      })
      .select('id')
      .single()

    if (insertError || !created) {
      setMessage(insertError?.message || 'Unable to create the expense.')
      setBusy(false)
      return
    }

    let billWarning = ''
    if (bill) {
      try {
        const compressed = await compressUploadImage(bill)
        setCompressionInfo(
          `Bill compressed from ${formatBytes(compressed.originalBytes)} to ${formatBytes(compressed.compressedBytes)}.`,
        )
        const path = `${profile.id}/${created.id}/bill-${Date.now()}.${compressed.extension}`
        const { error: uploadError } = await supabase.storage
          .from('expense-bills')
          .upload(path, compressed.blob, {
            contentType: compressed.contentType,
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) throw uploadError

        const { error: updateError } = await supabase
          .from('expenses')
          .update({ bill_path: path })
          .eq('id', created.id)

        if (updateError) throw updateError
      } catch (error) {
        billWarning = ` Expense saved, but bill upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }

    setTitle('')
    setCategory(expenseCategories[0])
    setAmount('')
    setExpenseDate(localIsoDate())
    setNote('')
    setBill(null)
    setMessage(`Expense submitted for admin approval.${billWarning}`)
    onSaved()
    setBusy(false)
  }

  return (
    <section className="content-card form-card">
      <div className="card-title-row">
        <div>
          <p className="eyebrow">EXPENSE SUBMISSION</p>
          <h2>Add an expense</h2>
        </div>
        <span className="gold-pill">Pending approval</span>
      </div>

      <form className="business-form" onSubmit={submit}>
        <label className="full-field">
          Expense name
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>

        <div className="form-grid">
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {expenseCategories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Amount (LKR)
            <input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
        </div>

        <label className="full-field">
          Expense date
          <input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required />
        </label>

        <label className="full-field">
          Note (optional)
          <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>

        <label className="upload-field full-field">
          Bill photo (optional)
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => setBill(event.target.files?.[0] || null)}
          />
          <span>{bill ? `${bill.name} • ${formatBytes(bill.size)}` : 'Take a photo or choose an image. It will be compressed before upload.'}</span>
        </label>

        {compressionInfo && <p className="success-message">{compressionInfo}</p>}
        {message && <p className={message.startsWith('Expense submitted') ? 'success-message' : 'form-message'}>{message}</p>}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit expense'}
        </button>
      </form>
    </section>
  )
}

function TransactionEditor({
  profile,
  editing,
  onClose,
  onSaved,
}: {
  profile: Profile
  editing: EditableTransaction
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(expenseCategories[0])
  const [date, setDate] = useState(localIsoDate())
  const [amount, setAmount] = useState('')
  const [exchangeRate, setExchangeRate] = useState('')
  const [note, setNote] = useState('')
  const [replacementBill, setReplacementBill] = useState<File | null>(null)
  const [removeBill, setRemoveBill] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [compressionInfo, setCompressionInfo] = useState('')

  useEffect(() => {
    if (editing.kind === 'income') {
      setTitle(editing.record.store_name)
      setDate(editing.record.received_date)
      setAmount(String(editing.record.amount_eur))
      setExchangeRate(String(editing.record.exchange_rate))
      setNote(editing.record.note || '')
    } else {
      setTitle(editing.record.title)
      setCategory(editing.record.category)
      setDate(editing.record.expense_date)
      setAmount(String(editing.record.amount_lkr))
      setNote(editing.record.note || '')
      setRemoveBill(false)
      setReplacementBill(null)
    }
    setMessage('')
    setCompressionInfo('')
  }, [editing])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setCompressionInfo('')

    if (editing.kind === 'income') {
      const euro = Number(amount)
      const rate = Number(exchangeRate)
      if (!title.trim() || euro <= 0 || rate <= 0) {
        setMessage('Please enter the store, EUR amount and exchange rate.')
        setBusy(false)
        return
      }

      const { error } = await supabase
        .from('income')
        .update({
          store_name: title.trim(),
          received_date: date,
          amount_eur: euro,
          exchange_rate: rate,
          note: note.trim() || null,
        })
        .eq('id', editing.record.id)

      if (error) {
        setMessage(error.message)
        setBusy(false)
        return
      }

      onSaved()
      onClose()
      return
    }

    const numericAmount = Number(amount)
    if (!title.trim() || numericAmount <= 0) {
      setMessage('Please enter an expense name and valid amount.')
      setBusy(false)
      return
    }

    let nextBillPath: string | null = removeBill ? null : editing.record.bill_path
    let uploadedPath: string | null = null

    if (replacementBill) {
      try {
        const compressed = await compressUploadImage(replacementBill)
        setCompressionInfo(
          `Bill compressed from ${formatBytes(compressed.originalBytes)} to ${formatBytes(compressed.compressedBytes)}.`,
        )
        uploadedPath = `${profile.id}/${editing.record.id}/bill-${Date.now()}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('expense-bills')
          .upload(uploadedPath, compressed.blob, {
            contentType: compressed.contentType,
            cacheControl: '3600',
            upsert: false,
          })
        if (uploadError) throw uploadError
        nextBillPath = uploadedPath
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to upload the replacement bill.')
        setBusy(false)
        return
      }
    }

    const { error } = await supabase
      .from('expenses')
      .update({
        title: title.trim(),
        category,
        amount_lkr: numericAmount,
        expense_date: date,
        note: note.trim() || null,
        bill_path: nextBillPath,
      })
      .eq('id', editing.record.id)

    if (error) {
      if (uploadedPath) await supabase.storage.from('expense-bills').remove([uploadedPath])
      setMessage(error.message)
      setBusy(false)
      return
    }

    if (
      editing.record.bill_path &&
      editing.record.bill_path !== nextBillPath
    ) {
      await supabase.storage.from('expense-bills').remove([editing.record.bill_path])
    }

    onSaved()
    onClose()
  }

  const converted = editing.kind === 'income'
    ? Number(amount || 0) * Number(exchangeRate || 0)
    : 0

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-editor-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">EDIT TRANSACTION</p>
            <h2 id="transaction-editor-title">
              {editing.kind === 'income' ? 'Edit income' : 'Edit expense'}
            </h2>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form className="business-form" onSubmit={submit}>
          <label className="full-field">
            {editing.kind === 'income' ? 'Store / customer' : 'Expense name'}
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>

          {editing.kind === 'expense' && (
            <label className="full-field">
              Category
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {expenseCategories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          )}

          <div className="form-grid">
            <label>
              {editing.kind === 'income' ? 'Received date' : 'Expense date'}
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </label>
            <label>
              {editing.kind === 'income' ? 'Amount received (€)' : 'Amount (LKR)'}
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </label>
          </div>

          {editing.kind === 'income' && (
            <>
              <label className="full-field">
                EUR → LKR exchange rate
                <input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  inputMode="decimal"
                  value={exchangeRate}
                  onChange={(event) => setExchangeRate(event.target.value)}
                  required
                />
              </label>
              <div className="calculation-box">
                <span>Updated income in LKR</span>
                <strong>{formatLKR(converted)}</strong>
              </div>
            </>
          )}

          <label className="full-field">
            Note (optional)
            <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>

          {editing.kind === 'expense' && (
            <>
              <label className="upload-field full-field">
                Replace bill photo (optional)
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => {
                    setReplacementBill(event.target.files?.[0] || null)
                    if (event.target.files?.[0]) setRemoveBill(false)
                  }}
                />
                <span>
                  {replacementBill
                    ? `${replacementBill.name} • ${formatBytes(replacementBill.size)}`
                    : editing.record.bill_path
                      ? 'The current bill will stay unless replaced or removed.'
                      : 'No bill is currently attached.'}
                </span>
              </label>

              {editing.record.bill_path && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={removeBill}
                    onChange={(event) => {
                      setRemoveBill(event.target.checked)
                      if (event.target.checked) setReplacementBill(null)
                    }}
                  />
                  Remove the current bill photo
                </label>
              )}
            </>
          )}

          {compressionInfo && <p className="success-message">{compressionInfo}</p>}
          {message && <p className="form-message">{message}</p>}

          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function TransactionsPanel({
  profile,
  income,
  expenses,
  profileNames,
  onChanged,
  mode,
}: {
  profile: Profile
  income: IncomeRecord[]
  expenses: ExpenseRecord[]
  profileNames: Map<string, string>
  onChanged: () => void
  mode: 'approvals' | 'transactions'
}) {
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<EditableTransaction | null>(null)
  const isAdmin = profile.role === 'admin'

  async function review(expense: ExpenseRecord, status: 'approved' | 'rejected') {
    let rejectionReason: string | null = null
    if (status === 'rejected') {
      const entered = window.prompt('Reason for rejection (optional):')
      if (entered === null) return
      rejectionReason = entered.trim() || null
    }

    setBusyId(expense.id)
    setMessage('')
    const { error } = await supabase
      .from('expenses')
      .update({
        status,
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejectionReason,
      })
      .eq('id', expense.id)

    if (error) setMessage(error.message)
    else {
      setMessage(`Expense ${status}.`)
      onChanged()
    }
    setBusyId('')
  }

  async function openBill(path: string) {
    setMessage('')
    const { data, error } = await supabase.storage.from('expense-bills').createSignedUrl(path, 120)
    if (error) setMessage(error.message)
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function deleteExpense(item: ExpenseRecord) {
    const allowed = isAdmin || (item.submitted_by === profile.id && item.status === 'pending')
    if (!allowed) return
    if (!window.confirm(`Delete expense “${item.title}”? This cannot be undone.`)) return

    setBusyId(item.id)
    setMessage('')
    const { error } = await supabase.from('expenses').delete().eq('id', item.id)
    if (error) {
      setMessage(error.message)
    } else {
      if (item.bill_path) {
        const { error: storageError } = await supabase.storage.from('expense-bills').remove([item.bill_path])
        if (storageError) setMessage(`Expense deleted. Bill cleanup warning: ${storageError.message}`)
        else setMessage('Expense deleted.')
      } else {
        setMessage('Expense deleted.')
      }
      onChanged()
    }
    setBusyId('')
  }

  async function deleteIncome(item: IncomeRecord) {
    if (!isAdmin) return
    if (!window.confirm(`Delete income from “${item.store_name}”? This cannot be undone.`)) return

    setBusyId(item.id)
    setMessage('')
    const { error } = await supabase.from('income').delete().eq('id', item.id)
    if (error) setMessage(error.message)
    else {
      setMessage('Income deleted.')
      onChanged()
    }
    setBusyId('')
  }

  async function reverseAutomaticPayment(item: IncomeRecord) {
    if (!isAdmin || item.source_type !== 'sales_payment' || !item.source_id) return

    const originalAmount = item.source_currency && item.source_amount != null
      ? formatCurrency(Number(item.source_amount), item.source_currency)
      : formatLKR(Number(item.amount_lkr || 0))
    const confirmed = window.confirm(
      `Reverse payment ${originalAmount} from “${item.store_name}”?\n\n` +
      'The linked income will be removed, the invoice balance and status will be recalculated, and the old receipt/invoice PDF will be invalidated.',
    )
    if (!confirmed) return

    setBusyId(item.id)
    setMessage('')
    const { data, error } = await supabase.rpc('reverse_sales_invoice_payment', {
      p_payment_id: item.source_id,
    })

    if (error) {
      setMessage(error.message)
      setBusyId('')
      return
    }

    const result = (data || {}) as ReversePaymentResult
    const paths = [result.receipt_pdf_path, result.invoice_pdf_path].filter((path): path is string => Boolean(path))
    let cleanupWarning = ''
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from('sales-documents').remove(paths)
      if (storageError) cleanupWarning = ` Private PDF cleanup warning: ${storageError.message}`
    }

    setMessage(
      `Payment reversed for ${result.invoice_code || 'the linked invoice'}. Income, invoice balance and status were recalculated.${cleanupWarning}` +
      (result.invoice_pdf_path ? ' Open Sales and use Refresh PDFs to create the updated invoice.' : ''),
    )
    onChanged()
    setBusyId('')
  }

  const pending = expenses.filter((item) => item.status === 'pending')
  const sortedExpenses = [...expenses].sort((a, b) => {
    const dateCompare = b.expense_date.localeCompare(a.expense_date)
    return dateCompare || b.created_at.localeCompare(a.created_at)
  })

  return (
    <div className="stacked-sections">
      {isAdmin && mode === 'approvals' && (
        <section className="content-card">
          <div className="card-title-row">
            <div>
              <p className="eyebrow">ACTION REQUIRED</p>
              <h2>Pending expense approvals</h2>
            </div>
            <span className="count-pill">{pending.length}</span>
          </div>

          {pending.length === 0 ? (
            <div className="empty-state">No expenses are waiting for approval.</div>
          ) : (
            <div className="record-list">
              {pending.map((item) => (
                <article className="record-card" key={item.id}>
                  <div className="record-main">
                    <div className="record-title-line">
                      <strong>{item.title}</strong>
                      <StatusBadge status={item.status} />
                    </div>
                    <p>{item.category} • {formatDate(item.expense_date)} • Submitted by {profileNames.get(item.submitted_by) || 'User'}</p>
                    {item.note && <p className="record-note">{item.note}</p>}
                  </div>
                  <div className="record-side">
                    <strong className="expense-value">−{formatLKR(item.amount_lkr)}</strong>
                    <div className="record-actions">
                      {item.bill_path && <button className="small-button" onClick={() => openBill(item.bill_path!)}>View bill</button>}
                      <button className="edit-button" onClick={() => setEditing({ kind: 'expense', record: item })}>Edit</button>
                      <button className="approve-button" disabled={busyId === item.id} onClick={() => review(item, 'approved')}>Approve</button>
                      <button className="reject-button" disabled={busyId === item.id} onClick={() => review(item, 'rejected')}>Reject</button>
                      <button className="delete-button" disabled={busyId === item.id} onClick={() => deleteExpense(item)}>Delete</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {message && <p className="form-message">{message}</p>}
        </section>
      )}

      {mode === 'transactions' && (
        <section className="content-card">
          <div className="card-title-row">
            <div>
              <p className="eyebrow">EXPENSE HISTORY</p>
              <h2>{isAdmin ? 'Expense transactions' : 'My submissions'}</h2>
            </div>
          </div>
          {sortedExpenses.length === 0 ? (
            <div className="empty-state">No expenses yet.</div>
          ) : (
            <div className="record-list">
              {sortedExpenses.map((item) => {
                const canChange = !item.source_type && (isAdmin || (item.submitted_by === profile.id && item.status === 'pending'))
                return (
                  <article className="record-card compact" key={item.id}>
                    <div className="record-main">
                      <div className="record-title-line">
                        <strong>{item.title}</strong>
                        <StatusBadge status={item.status} />
                      </div>
                      <p>{item.category} • {formatDate(item.expense_date)}{isAdmin ? ` • ${profileNames.get(item.submitted_by) || 'User'}` : ''}</p>
                      {item.note && <p className="record-note">{item.note}</p>}
                      {item.rejection_reason && <p className="rejection-note">Reason: {item.rejection_reason}</p>}
                    </div>
                    <div className="record-side">
                      <strong className="expense-value">−{formatLKR(item.amount_lkr)}</strong>
                      <div className="record-actions">
                        {item.bill_path && <button className="small-button" onClick={() => openBill(item.bill_path!)}>View bill</button>}
                        {canChange && <button className="edit-button" onClick={() => setEditing({ kind: 'expense', record: item })}>Edit</button>}
                        {canChange && <button className="delete-button" disabled={busyId === item.id} onClick={() => deleteExpense(item)}>Delete</button>}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      {isAdmin && mode === 'transactions' && (
        <section className="content-card">
          <div className="card-title-row">
            <div>
              <p className="eyebrow">INCOME HISTORY</p>
              <h2>Received payments</h2>
            </div>
          </div>
          {income.length === 0 ? (
            <div className="empty-state">No income has been recorded yet.</div>
          ) : (
            <div className="record-list">
              {income.map((item) => (
                <article className="record-card compact" key={item.id}>
                  <div className="record-main">
                    <strong>{item.store_name}</strong>
                    <p>{formatDate(item.received_date)} • {item.source_currency && item.source_amount != null ? formatCurrency(Number(item.source_amount), item.source_currency) : `${formatEUR(item.amount_eur)} × ${Number(item.exchange_rate).toFixed(4)}`}</p>
                    {item.note && <p className="record-note">{item.note}</p>}
                    {item.source_type && <span className="gold-pill">Automatic</span>}
                  </div>
                  <div className="record-side">
                    <strong className="income-value">+{formatLKR(item.amount_lkr)}</strong>
                    {!item.source_type && <div className="record-actions">
                      <button className="edit-button" onClick={() => setEditing({ kind: 'income', record: item })}>Edit</button>
                      <button className="delete-button" disabled={busyId === item.id} onClick={() => deleteIncome(item)}>Delete</button>
                    </div>}
                    {item.source_type === 'sales_payment' && item.source_id && (
                      <div className="record-actions">
                        <button
                          className="delete-button"
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => reverseAutomaticPayment(item)}
                        >
                          {busyId === item.id ? 'Reversing…' : 'Reverse payment'}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {message && mode === 'transactions' && <p className="form-message page-message">{message}</p>}
      {editing && (
        <TransactionEditor
          profile={profile}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}
    </div>
  )
}


function EmployeeManager({
  currentProfile,
  profiles,
  onChanged,
}: {
  currentProfile: Profile
  profiles: Profile[]
  onChanged: () => Promise<void>
}) {
  const [invite, setInvite] = useState({
    full_name: '',
    email: '',
    phone: '',
    job_title: '',
    monthly_salary: '',
    salary_currency: 'EUR',
  })
  const [editing, setEditing] = useState<Profile | null>(null)
  const [editValues, setEditValues] = useState({
    full_name: '',
    phone: '',
    job_title: '',
    monthly_salary: '',
    salary_currency: 'EUR',
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const employees = useMemo(
    () => [...profiles].sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '')),
    [profiles],
  )

  async function inviteEmployee(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setError('')

    const { data, error: functionError } = await supabase.functions.invoke('invite-employee', {
      body: {
        full_name: invite.full_name.trim(),
        email: invite.email.trim().toLowerCase(),
        phone: invite.phone.trim() || null,
        job_title: invite.job_title.trim() || null,
        monthly_salary: Number(invite.monthly_salary || 0),
        salary_currency: invite.salary_currency,
      },
    })

    if (functionError) {
      setError(functionError.message)
    } else if (data?.error) {
      setError(data.error)
    } else {
      setMessage(`Invitation sent to ${invite.email.trim()}.`)
      setInvite({
        full_name: '',
        email: '',
        phone: '',
        job_title: '',
        monthly_salary: '',
        salary_currency: 'EUR',
      })
      await onChanged()
    }

    setBusy(false)
  }

  function beginEdit(employee: Profile) {
    setEditing(employee)
    setMessage('')
    setError('')
    setEditValues({
      full_name: employee.full_name || '',
      phone: employee.phone || '',
      job_title: employee.job_title || '',
      monthly_salary: String(Number(employee.monthly_salary || 0)),
      salary_currency: employee.salary_currency || 'EUR',
    })
  }

  async function saveEmployee(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    setBusy(true)
    setMessage('')
    setError('')

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: editValues.full_name.trim(),
        phone: editValues.phone.trim() || null,
        job_title: editValues.job_title.trim() || null,
        monthly_salary: Number(editValues.monthly_salary || 0),
        salary_currency: editValues.salary_currency,
      })
      .eq('id', editing.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setMessage('Employee profile updated.')
      setEditing(null)
      await onChanged()
    }
    setBusy(false)
  }

  async function toggleActive(employee: Profile) {
    if (employee.id === currentProfile.id) {
      setError('Your own administrator account cannot be disabled here.')
      return
    }

    const action = employee.active ? 'deactivate' : 'activate'
    if (!window.confirm(`Are you sure you want to ${action} ${employee.full_name || employee.email || 'this employee'}?`)) return

    setBusy(true)
    setMessage('')
    setError('')
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ active: !employee.active })
      .eq('id', employee.id)

    if (updateError) setError(updateError.message)
    else {
      setMessage(`Employee ${employee.active ? 'deactivated' : 'activated'}.`)
      await onChanged()
    }
    setBusy(false)
  }

  return (
    <div className="stacked-sections">
      <section className="content-card">
        <div className="card-title-row">
          <div>
            <p className="eyebrow">ADMIN ONLY</p>
            <h2>Invite an employee</h2>
            <p className="section-copy">The employee receives a secure email invitation and joins as a regular user.</p>
          </div>
          <span className="gold-pill">User role</span>
        </div>

        <form className="employee-form" onSubmit={inviteEmployee}>
          <label>
            Full name
            <input
              value={invite.full_name}
              onChange={(event) => setInvite((value) => ({ ...value, full_name: event.target.value }))}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={invite.email}
              onChange={(event) => setInvite((value) => ({ ...value, email: event.target.value }))}
              required
            />
          </label>
          <label>
            Phone
            <input
              type="tel"
              value={invite.phone}
              onChange={(event) => setInvite((value) => ({ ...value, phone: event.target.value }))}
            />
          </label>
          <label>
            Job title
            <input
              value={invite.job_title}
              onChange={(event) => setInvite((value) => ({ ...value, job_title: event.target.value }))}
              placeholder="Production assistant"
            />
          </label>
          <label>
            Monthly salary
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={invite.monthly_salary}
              onChange={(event) => setInvite((value) => ({ ...value, monthly_salary: event.target.value }))}
            />
          </label>
          <label>
            Currency
            <select
              value={invite.salary_currency}
              onChange={(event) => setInvite((value) => ({ ...value, salary_currency: event.target.value }))}
            >
              <option value="EUR">EUR</option>
              <option value="LKR">LKR</option>
            </select>
          </label>
          <button className="primary-button employee-submit" disabled={busy} type="submit">
            {busy ? 'Sending…' : 'Send invitation'}
          </button>
        </form>

        {message && <p className="success-message">{message}</p>}
        {error && <p className="error-message panel-message">{error}</p>}
      </section>

      <section className="content-card">
        <div className="card-title-row">
          <div>
            <p className="eyebrow">TEAM</p>
            <h2>Employees</h2>
            <p className="section-copy">Manage employee details, monthly salary and account access.</p>
          </div>
          <span className="count-pill">{employees.length}</span>
        </div>

        <div className="employee-list">
          {employees.map((employee) => (
            <article className="employee-card" key={employee.id}>
              <div className="employee-avatar">{(employee.full_name || employee.email || 'U').charAt(0).toUpperCase()}</div>
              <div className="employee-main">
                <div className="employee-name-row">
                  <strong>{employee.full_name || 'Name not set'}</strong>
                  <span className={`status-badge ${employee.active ? 'approved' : 'rejected'}`}>
                    {employee.active ? 'active' : 'inactive'}
                  </span>
                  {employee.role === 'admin' && <span className="gold-pill compact-pill">Admin</span>}
                </div>
                <span className="employee-email">{employee.email || 'No email'}</span>
                <div className="employee-meta">
                  <span>{employee.job_title || 'Job title not set'}</span>
                  <span>{employee.phone || 'No phone'}</span>
                  <span>{formatCurrency(Number(employee.monthly_salary || 0), employee.salary_currency || 'EUR')} / month</span>
                </div>
              </div>
              <div className="employee-actions">
                <button className="small-button" type="button" onClick={() => beginEdit(employee)}>Edit</button>
                {employee.id !== currentProfile.id && (
                  <button
                    className={employee.active ? 'small-button danger-button' : 'small-button success-button'}
                    type="button"
                    disabled={busy}
                    onClick={() => toggleActive(employee)}
                  >
                    {employee.active ? 'Deactivate' : 'Activate'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditing(null)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="employee-edit-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="card-title-row">
              <div>
                <p className="eyebrow">EMPLOYEE PROFILE</p>
                <h2 id="employee-edit-title">Edit employee</h2>
                <p className="section-copy">{editing.email}</p>
              </div>
              <button className="icon-close" type="button" onClick={() => setEditing(null)} aria-label="Close">×</button>
            </div>

            <form className="edit-grid" onSubmit={saveEmployee}>
              <label>
                Full name
                <input value={editValues.full_name} onChange={(event) => setEditValues((value) => ({ ...value, full_name: event.target.value }))} required />
              </label>
              <label>
                Phone
                <input type="tel" value={editValues.phone} onChange={(event) => setEditValues((value) => ({ ...value, phone: event.target.value }))} />
              </label>
              <label>
                Job title
                <input value={editValues.job_title} onChange={(event) => setEditValues((value) => ({ ...value, job_title: event.target.value }))} />
              </label>
              <label>
                Monthly salary
                <input type="number" min="0" step="0.01" inputMode="decimal" value={editValues.monthly_salary} onChange={(event) => setEditValues((value) => ({ ...value, monthly_salary: event.target.value }))} />
              </label>
              <label>
                Currency
                <select value={editValues.salary_currency} onChange={(event) => setEditValues((value) => ({ ...value, salary_currency: event.target.value }))}>
                  <option value="EUR">EUR</option>
                  <option value="LKR">LKR</option>
                </select>
              </label>
              <div className="modal-actions full-row">
                <button className="outline-light-button" type="button" onClick={() => setEditing(null)}>Cancel</button>
                <button className="primary-button" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save employee'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}


function EmployeeBackButton({ onBack }: { onBack: () => void }) {
  return (
    <button className="back-home-button" type="button" onClick={onBack}>
      ← Back to my home
    </button>
  )
}

function EmployeeHome({
  profile,
  expenses,
  attendance,
  payrolls,
  onOpen,
  language,
  unreadMessages,
}: {
  profile: Profile
  expenses: ExpenseRecord[]
  attendance: AttendanceRecord[]
  payrolls: PayrollRecord[]
  onOpen: (view: View) => void
  language: AppLanguage
  unreadMessages: number
}) {
  const month = currentMonthValue()
  const currentAttendance = attendance.filter((item) => item.work_date.startsWith(month))
  const present = currentAttendance.filter((item) => item.status === 'present').length
  const halfDays = currentAttendance.filter((item) => item.status === 'half_day').length
  const pending = expenses.filter((item) => item.status === 'pending').length
  const latestPayslip = [...payrolls].sort((a, b) => b.period_start.localeCompare(a.period_start))[0]
  const todayAttendance = attendance.find((item) => item.work_date === localIsoDate())
  const todayStatus = todayAttendance ? t(todayAttendance.status, language) : (language === 'si' ? 'අද පැමිණීම සටහන් කර නැහැ' : 'Attendance not marked yet')

  const actions: { view: View; title: string; copy: string; icon: string; badge?: string }[] = [
    { view: 'expense', title: t('Submit expense', language), copy: t('Add a business expense and optional bill photo.', language), icon: '+' },
    { view: 'transactions', title: t('My expenses', language), copy: t('Track pending, approved and rejected submissions.', language), icon: '≡', badge: pending ? String(pending) : undefined },
    { view: 'attendance', title: t('My attendance', language), copy: language === 'si' ? `මේ මාසයේ: පැමිණි දින ${present}, අර්ධ දින ${halfDays}.` : `This month: ${present} present, ${halfDays} half day.`, icon: '✓' },
    { view: 'payslips', title: t('My payslips', language), copy: latestPayslip ? (language === 'si' ? `${formatMonth(latestPayslip.period_start)} වැටුප් පත්‍රය ලබාගත හැක.` : `${formatMonth(latestPayslip.period_start)} is available.`) : t('Monthly salary records will appear here.', language), icon: '€' },
    { view: 'messages', title: t('Contact admin', language), copy: t('Send a private message, suggestion, complaint or request.', language), icon: '✉', badge: unreadMessages ? String(unreadMessages) : undefined },
    { view: 'profile', title: t('My profile', language), copy: t('View your job, contact and salary details.', language), icon: '◉' },
  ]

  return (
    <>
      <section className="welcome-panel employee-welcome-panel">
        <p className="eyebrow">MY WORKSPACE</p>
        <h1>Hello, {profile.full_name.trim() || 'Team Member'}</h1>
        {profile.email && <p className="welcome-email">{profile.email}</p>}
        <p>Your personal Aroma Ceylon workspace keeps expenses, attendance and salary information in one secure place.</p>
      </section>

      <section className="android-mobile-status" aria-label="Today and notifications">
        <article>
          <span>{language === 'si' ? 'අද' : 'Today'}</span>
          <strong>{todayStatus}</strong>
        </article>
        <button type="button" onClick={() => onOpen('messages')}>
          <span>{language === 'si' ? 'පණිවිඩ' : 'Messages'}</span>
          <strong>{unreadMessages > 0 ? (language === 'si' ? `නොකියවූ ${unreadMessages}` : `${unreadMessages} unread`) : (language === 'si' ? 'අලුත් පණිවිඩ නැහැ' : 'All caught up')}</strong>
        </button>
      </section>

      <section className="employee-summary-grid">
        <article className="employee-summary-card">
          <span>Pending expenses</span>
          <strong>{pending}</strong>
        </article>
        <article className="employee-summary-card">
          <span>Present this month</span>
          <strong>{present}</strong>
        </article>
        <article className="employee-summary-card">
          <span>Monthly salary</span>
          <strong>{formatCurrency(Number(profile.monthly_salary || 0), profile.salary_currency || 'EUR')}</strong>
        </article>
      </section>

      <section className="employee-home-grid" aria-label="Employee tools">
        {actions.map((action) => (
          <button className={`employee-home-card employee-action-${action.view}`} data-view={action.view} type="button" key={action.view} onClick={() => onOpen(action.view)}>
            <span className="employee-home-icon">{action.icon}</span>
            <span className="employee-home-copy">
              <strong>{action.title}</strong>
              <small>{action.copy}</small>
            </span>
            {action.badge && <span className="employee-home-badge">{action.badge}</span>}
            <span className="employee-home-arrow">›</span>
          </button>
        ))}
      </section>
    </>
  )
}


function AndroidEmployeeBottomNav({
  activeView,
  onOpen,
  unreadMessages,
  language,
}: {
  activeView: View
  onOpen: (view: View) => void
  unreadMessages: number
  language: AppLanguage
}) {
  const items: { view: View; label: string; icon: string }[] = [
    { view: 'dashboard', label: language === 'si' ? 'මුල් පිටුව' : 'Home', icon: '⌂' },
    { view: 'messages', label: language === 'si' ? 'පණිවිඩ' : 'Messages', icon: '✉' },
    { view: 'attendance', label: language === 'si' ? 'පැමිණීම' : 'Attendance', icon: '✓' },
    { view: 'payslips', label: language === 'si' ? 'වැටුප්' : 'Payslips', icon: '€' },
    { view: 'profile', label: language === 'si' ? 'පැතිකඩ' : 'Profile', icon: '◉' },
  ]
  const normalizedView: View = ['expense', 'transactions'].includes(activeView) ? 'dashboard' : activeView

  return (
    <nav className="android-bottom-nav" aria-label="Android employee navigation">
      {items.map((item) => (
        <button
          type="button"
          key={item.view}
          className={normalizedView === item.view ? 'active' : ''}
          onClick={() => onOpen(item.view)}
        >
          <span className="android-bottom-icon">{item.icon}</span>
          <span>{item.label}</span>
          {item.view === 'messages' && unreadMessages > 0 && <em>{unreadMessages}</em>}
        </button>
      ))}
    </nav>
  )
}

function ProfilePanel({ profile, onBack, onContactAdmin, language }: { profile: Profile; onBack?: () => void; onContactAdmin?: () => void; language: AppLanguage }) {
  const details = [
    ['Full name', profile.full_name || 'Not set'],
    ['Email', profile.email || 'Not set'],
    ['Phone', profile.phone || 'Not set'],
    ['Job title', profile.job_title || 'Not set'],
    ['Account status', profile.active ? 'Active' : 'Inactive'],
    ['Monthly salary', formatCurrency(Number(profile.monthly_salary || 0), profile.salary_currency || 'EUR')],
  ]

  return (
    <div className="stacked-sections">
      {onBack && <EmployeeBackButton onBack={onBack} />}
      <section className="content-card">
        <div className="card-title-row">
          <div>
            <p className="eyebrow">EMPLOYEE PROFILE</p>
            <h2>My profile</h2>
            <p className="section-copy">Contact the administrator when any information needs to be updated.</p>
          </div>
          <div className="employee-avatar profile-avatar">{(profile.full_name || profile.email || 'U').charAt(0).toUpperCase()}</div>
        </div>
        <div className="profile-details-grid">
          {details.map(([label, value]) => (
            <div className="profile-detail" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        {isAndroidApp() && (
          <button className="secondary-button android-notification-settings" type="button" onClick={openAndroidNotificationSettings}>
            {language === 'si' ? 'දැනුම්දීම් සැකසුම්' : 'Notification settings'}
          </button>
        )}
        {onContactAdmin && (
          <button className="primary-button profile-contact-button" type="button" onClick={onContactAdmin}>
            Contact admin
          </button>
        )}
      </section>
    </div>
  )
}

function PayslipsPanel({
  profile,
  payrolls,
  onBack,
}: {
  profile: Profile
  payrolls: PayrollRecord[]
  onBack?: () => void
}) {
  const sorted = [...payrolls]
    .filter((item) => item.status === 'finalized' || item.status === 'paid')
    .sort((a, b) => b.period_start.localeCompare(a.period_start))
  const [downloadingId, setDownloadingId] = useState('')
  const [error, setError] = useState('')

  async function download(item: PayrollRecord) {
    setDownloadingId(item.id)
    setError('')
    try {
      await downloadPrivatePayslip(item, profile.full_name || profile.email || 'Employee')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to download the payslip.')
    } finally {
      setDownloadingId('')
    }
  }

  return (
    <div className="stacked-sections">
      {onBack && <EmployeeBackButton onBack={onBack} />}
      <section className="content-card">
        <div className="card-title-row">
          <div>
            <p className="eyebrow">SALARY HISTORY</p>
            <h2>My payslips</h2>
            <p className="section-copy">Finalized salary records and private PDF payslips are visible only to you and the administrator.</p>
          </div>
        </div>

        {error && <p className="error-message panel-message">{error}</p>}

        {sorted.length === 0 ? (
          <div className="empty-state">
            No finalized payslips yet. Your current monthly salary is {formatCurrency(Number(profile.monthly_salary || 0), profile.salary_currency || 'EUR')}.
          </div>
        ) : (
          <div className="payslip-list">
            {sorted.map((item) => (
              <article className="payslip-card employee-payslip-card" key={item.id}>
                <div>
                  <strong>{formatMonth(item.period_start)}</strong>
                  <p>
                    {Number(item.present_days || 0)} present • {Number(item.half_day_days || 0)} half day • {Number(item.absent_days || 0)} absent • {Number(item.leave_days || 0)} leave
                  </p>
                </div>
                <div className="payslip-side">
                  <strong>{formatCurrency(Number(item.net_salary || 0), item.currency || 'EUR')}</strong>
                  <span className={`status-badge ${item.status === 'paid' ? 'approved' : 'pending'}`}>{item.status}</span>
                  <button
                    className="small-button payslip-download-button"
                    type="button"
                    disabled={!item.payslip_path || downloadingId === item.id}
                    onClick={() => download(item)}
                  >
                    {downloadingId === item.id ? 'Preparing…' : 'Download PDF'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function PayrollManager({
  profile,
  profiles,
  attendance,
  payrolls,
  onChanged,
}: {
  profile: Profile
  profiles: Profile[]
  attendance: AttendanceRecord[]
  payrolls: PayrollRecord[]
  onChanged: () => void
}) {
  const employees = profiles.filter((item) => item.role === 'user')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    employees.find((item) => item.active)?.id || employees[0]?.id || '',
  )
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue())
  const [values, setValues] = useState({
    basic_salary: '0',
    bonus: '0',
    allowance: '0',
    deductions: '0',
    advance: '0',
    exchange_rate_lkr: '1',
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [downloadingId, setDownloadingId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const selectedEmployee = employees.find((item) => item.id === selectedEmployeeId) || null
  const periodStart = `${selectedMonth}-01`
  const selectedPayroll = payrolls.find(
    (item) => item.employee_id === selectedEmployeeId && item.period_start === periodStart,
  ) || null

  const attendanceSummary = useMemo(() => {
    const records = attendance.filter(
      (item) => item.employee_id === selectedEmployeeId && item.work_date.startsWith(selectedMonth),
    )
    const present = records.filter((item) => item.status === 'present').length
    const halfDays = records.filter((item) => item.status === 'half_day').length
    const absent = records.filter((item) => item.status === 'absent').length
    const leave = records.filter((item) => item.status === 'leave').length
    return {
      workingDays: present + halfDays + absent + leave,
      present,
      halfDays,
      absent,
      leave,
    }
  }, [attendance, selectedEmployeeId, selectedMonth])

  useEffect(() => {
    if (!selectedEmployeeId && employees.length) {
      setSelectedEmployeeId(employees.find((item) => item.active)?.id || employees[0].id)
    }
  }, [employees, selectedEmployeeId])

  useEffect(() => {
    setMessage('')
    setError('')
    if (selectedPayroll) {
      setValues({
        basic_salary: String(Number(selectedPayroll.basic_salary || 0)),
        bonus: String(Number(selectedPayroll.bonus || 0)),
        allowance: String(Number(selectedPayroll.allowance || 0)),
        deductions: String(Number(selectedPayroll.deductions || 0)),
        advance: String(Number(selectedPayroll.advance || 0)),
        exchange_rate_lkr: String(Number(selectedPayroll.exchange_rate_lkr || 1)),
        notes: selectedPayroll.notes || '',
      })
    } else {
      setValues({
        basic_salary: String(Number(selectedEmployee?.monthly_salary || 0)),
        bonus: '0',
        allowance: '0',
        deductions: '0',
        advance: '0',
        exchange_rate_lkr: '1',
        notes: '',
      })
    }
  }, [selectedEmployee, selectedPayroll])

  const basic = Number(values.basic_salary || 0)
  const bonus = Number(values.bonus || 0)
  const allowance = Number(values.allowance || 0)
  const deductions = Number(values.deductions || 0)
  const advance = Number(values.advance || 0)
  const payrollExchangeRate = Number(values.exchange_rate_lkr || 1)
  const gross = basic + bonus + allowance
  const net = gross - deductions - advance
  const currency = selectedPayroll?.currency || selectedEmployee?.salary_currency || 'EUR'
  const locked = selectedPayroll?.status === 'finalized' || selectedPayroll?.status === 'paid'

  function payrollPayload() {
    if (!selectedEmployee) throw new Error('Choose an employee first.')
    if ([basic, bonus, allowance, deductions, advance].some((amount) => !Number.isFinite(amount) || amount < 0)) {
      throw new Error('Salary amounts must be valid positive numbers or zero.')
    }
    if (net < 0) throw new Error('Net salary cannot be below zero.')
    if ((selectedEmployee.salary_currency || 'EUR') === 'EUR' && payrollExchangeRate <= 0) {
      throw new Error('Enter the EUR to LKR exchange rate for profit calculations.')
    }

    return {
      employee_id: selectedEmployee.id,
      period_start: periodStart,
      currency: selectedEmployee.salary_currency || 'EUR',
      exchange_rate_lkr: (selectedEmployee.salary_currency || 'EUR') === 'EUR' ? payrollExchangeRate : 1,
      basic_salary: basic,
      bonus,
      allowance,
      deductions,
      advance,
      working_days: attendanceSummary.workingDays,
      present_days: attendanceSummary.present,
      half_day_days: attendanceSummary.halfDays,
      absent_days: attendanceSummary.absent,
      leave_days: attendanceSummary.leave,
      notes: values.notes.trim() || null,
      created_by: profile.id,
    }
  }

  async function saveDraft() {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const payload = payrollPayload()
      const { error: saveError } = await supabase
        .from('payrolls')
        .upsert(
          {
            ...payload,
            status: 'draft',
            payslip_path: null,
            finalized_by: null,
            finalized_at: null,
            paid_at: null,
          },
          { onConflict: 'employee_id,period_start' },
        )
      if (saveError) throw saveError
      setMessage('Payroll draft saved.')
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save payroll.')
    } finally {
      setBusy(false)
    }
  }

  async function finalizePayroll() {
    if (!selectedEmployee) return
    if (!window.confirm(`Finalize ${formatMonth(periodStart)} payroll for ${selectedEmployee.full_name || selectedEmployee.email}?`)) return

    setBusy(true)
    setMessage('')
    setError('')
    try {
      const payload = payrollPayload()
      const finalizedAt = new Date().toISOString()
      const { data: draft, error: draftError } = await supabase
        .from('payrolls')
        .upsert(
          {
            ...payload,
            status: 'draft',
            payslip_path: null,
            finalized_by: null,
            finalized_at: null,
            paid_at: null,
          },
          { onConflict: 'employee_id,period_start' },
        )
        .select('*')
        .single()
      if (draftError) throw draftError

      const finalRecord = {
        ...(draft as PayrollRecord),
        status: 'finalized' as PayrollStatus,
        finalized_by: profile.id,
        finalized_at: finalizedAt,
        paid_at: null,
      }
      const pdfBlob = await createPayslipPdfBlob(finalRecord, selectedEmployee, profile.full_name || profile.email || 'Administrator')
      const pdfPath = `${selectedEmployee.id}/${periodStart}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('payslips')
        .upload(pdfPath, pdfBlob, { contentType: 'application/pdf', upsert: true })
      if (uploadError) throw uploadError

      const { error: finalizeError } = await supabase
        .from('payrolls')
        .update({
          status: 'finalized',
          payslip_path: pdfPath,
          finalized_by: profile.id,
          finalized_at: finalizedAt,
          paid_at: null,
        })
        .eq('id', draft.id)
      if (finalizeError) throw finalizeError

const { error: pushError } = await supabase.functions.invoke('send-payslip-push', {
  body: {
    payroll_id: draft.id,
  },
})

if (pushError) {
  console.warn('Payslip notification delivery failed:', pushError.message)
}

setMessage('Payroll finalized and PDF payslip created.')
onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to finalize payroll.')
    } finally {
      setBusy(false)
    }
  }

  async function markPaid() {
    if (!selectedEmployee || !selectedPayroll) return
    if (!window.confirm(`Mark ${formatMonth(selectedPayroll.period_start)} salary as paid?`)) return

    setBusy(true)
    setMessage('')
    setError('')
    let paidSaved = false
    try {
      const paidAt = new Date().toISOString()
      const paidRecord = { ...selectedPayroll, status: 'paid' as PayrollStatus, paid_at: paidAt }
      const pdfBlob = await createPayslipPdfBlob(paidRecord, selectedEmployee, profile.full_name || profile.email || 'Administrator')
      const pdfPath = selectedPayroll.payslip_path || `${selectedEmployee.id}/${periodStart}.pdf`

      const { error: updateError } = await supabase
        .from('payrolls')
        .update({ status: 'paid', paid_at: paidAt, payslip_path: pdfPath })
        .eq('id', selectedPayroll.id)
      if (updateError) throw updateError
      paidSaved = true

      const { error: uploadError } = await supabase.storage
        .from('payslips')
        .upload(pdfPath, pdfBlob, { contentType: 'application/pdf', upsert: true })
      if (uploadError) throw uploadError

      setMessage('Salary marked as paid, added to approved expenses and the PDF was refreshed.')
      onChanged()
    } catch (caught) {
      if (paidSaved) {
        setError(`Salary was marked as paid and accounting was updated, but the PDF needs a refresh: ${caught instanceof Error ? caught.message : 'PDF upload failed.'}`)
        onChanged()
      } else {
        setError(caught instanceof Error ? caught.message : 'Unable to mark salary as paid.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function refreshPayslip() {
    if (!selectedEmployee || !selectedPayroll || selectedPayroll.status === 'draft') return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const pdfBlob = await createPayslipPdfBlob(selectedPayroll, selectedEmployee, profile.full_name || profile.email || 'Administrator')
      const pdfPath = selectedPayroll.payslip_path || `${selectedEmployee.id}/${periodStart}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('payslips')
        .upload(pdfPath, pdfBlob, { contentType: 'application/pdf', upsert: true })
      if (uploadError) throw uploadError
      if (selectedPayroll.payslip_path !== pdfPath) {
        const { error: updateError } = await supabase.from('payrolls').update({ payslip_path: pdfPath }).eq('id', selectedPayroll.id)
        if (updateError) throw updateError
      }
      setMessage('Payslip PDF refreshed with the current premium design and employee language.')
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to refresh the payslip PDF.')
    } finally {
      setBusy(false)
    }
  }

  async function reopenDraft() {
    if (!selectedPayroll) return
    if (!window.confirm('Reopen this payroll as a draft? The current PDF will be removed until you finalize it again.')) return

    setBusy(true)
    setMessage('')
    setError('')
    try {
      if (selectedPayroll.payslip_path) {
        const { error: removeError } = await supabase.storage.from('payslips').remove([selectedPayroll.payslip_path])
        if (removeError) throw removeError
      }
      const { error: updateError } = await supabase
        .from('payrolls')
        .update({
          status: 'draft',
          payslip_path: null,
          finalized_by: null,
          finalized_at: null,
          paid_at: null,
        })
        .eq('id', selectedPayroll.id)
      if (updateError) throw updateError
      setMessage('Payroll reopened as a draft.')
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to reopen payroll.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteDraft() {
    if (!selectedPayroll || selectedPayroll.status !== 'draft') return
    if (!window.confirm('Delete this payroll draft?')) return

    setBusy(true)
    setMessage('')
    setError('')
    try {
      const { error: deleteError } = await supabase.from('payrolls').delete().eq('id', selectedPayroll.id)
      if (deleteError) throw deleteError
      setMessage('Payroll draft deleted.')
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete payroll draft.')
    } finally {
      setBusy(false)
    }
  }

  async function download(item: PayrollRecord, employee: Profile) {
    setDownloadingId(item.id)
    setError('')
    try {
      await downloadPrivatePayslip(item, employee.full_name || employee.email || 'Employee')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to download payslip.')
    } finally {
      setDownloadingId('')
    }
  }

  const history = [...payrolls].sort((a, b) => b.period_start.localeCompare(a.period_start))

  return (
    <div className="stacked-sections">
      <section className="content-card payroll-control-card">
        <div className="card-title-row">
          <div>
            <p className="eyebrow">PAYROLL CONTROL</p>
            <h2>Salary & payslips</h2>
            <p className="section-copy">Prepare monthly salary, use attendance totals and create a private branded PDF payslip.</p>
          </div>
          {selectedPayroll && <span className={`status-badge ${selectedPayroll.status === 'paid' ? 'approved' : selectedPayroll.status === 'finalized' ? 'pending' : ''}`}>{selectedPayroll.status}</span>}
        </div>

        {employees.length === 0 ? (
          <div className="empty-state">Invite an employee before preparing payroll.</div>
        ) : (
          <>
            <div className="payroll-selectors">
              <label>
                Employee
                <select value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)}>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.full_name || employee.email}</option>
                  ))}
                </select>
              </label>
              <label>
                Salary month
                <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
              </label>
              <div className="payroll-profile-rate">
                <span>Profile salary</span>
                <strong>{selectedEmployee ? formatCurrency(Number(selectedEmployee.monthly_salary || 0), selectedEmployee.salary_currency || 'EUR') : '—'}</strong>
              </div>
            </div>

            <div className="payroll-attendance-grid">
              <article><span>Working days</span><strong>{attendanceSummary.workingDays}</strong></article>
              <article><span>Present</span><strong>{attendanceSummary.present}</strong></article>
              <article><span>Half day</span><strong>{attendanceSummary.halfDays}</strong></article>
              <article><span>Absent</span><strong>{attendanceSummary.absent}</strong></article>
              <article><span>Leave</span><strong>{attendanceSummary.leave}</strong></article>
            </div>

            {!locked ? (
              <>
                <form className="payroll-form" onSubmit={(event) => { event.preventDefault(); saveDraft() }}>
                  <label>
                    Basic salary
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={values.basic_salary} onChange={(event) => setValues((current) => ({ ...current, basic_salary: event.target.value }))} required />
                  </label>
                  <label>
                    Bonus
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={values.bonus} onChange={(event) => setValues((current) => ({ ...current, bonus: event.target.value }))} />
                  </label>
                  <label>
                    Allowance
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={values.allowance} onChange={(event) => setValues((current) => ({ ...current, allowance: event.target.value }))} />
                  </label>
                  <label>
                    Deductions
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={values.deductions} onChange={(event) => setValues((current) => ({ ...current, deductions: event.target.value }))} />
                  </label>
                  <label>
                    Salary advance
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={values.advance} onChange={(event) => setValues((current) => ({ ...current, advance: event.target.value }))} />
                  </label>
                  {currency === 'EUR' && <label>
                    EUR to LKR exchange rate
                    <input type="number" min="0.0001" step="0.0001" inputMode="decimal" value={values.exchange_rate_lkr} onChange={(event) => setValues((current) => ({ ...current, exchange_rate_lkr: event.target.value }))} required />
                  </label>}
                  <label className="payroll-notes-field">
                    Notes
                    <textarea rows={3} value={values.notes} onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional payroll note" />
                  </label>
                </form>

                <div className="payroll-calculation">
                  <div><span>Gross earnings</span><strong>{formatCurrency(gross, currency)}</strong></div>
                  <div><span>Total deductions</span><strong>−{formatCurrency(deductions + advance, currency)}</strong></div>
                  <div className="payroll-net"><span>Net salary</span><strong>{formatCurrency(net, currency)}</strong></div>
                </div>
                <p className="module-note">Attendance is recorded on the payslip, but it does not deduct salary automatically. Enter any required deduction manually.</p>

                <div className="payroll-actions">
                  <button className="outline-light-button" type="button" disabled={busy} onClick={saveDraft}>{busy ? 'Saving…' : 'Save draft'}</button>
                  <button className="primary-button" type="button" disabled={busy} onClick={finalizePayroll}>{busy ? 'Creating…' : 'Finalize & create PDF'}</button>
                  {selectedPayroll?.status === 'draft' && <button className="small-button danger-button" type="button" disabled={busy} onClick={deleteDraft}>Delete draft</button>}
                </div>
              </>
            ) : selectedPayroll && selectedEmployee ? (
              <div className="finalized-payroll-panel">
                <div className="payroll-calculation finalized-calculation">
                  <div><span>Basic salary</span><strong>{formatCurrency(Number(selectedPayroll.basic_salary), selectedPayroll.currency)}</strong></div>
                  <div><span>Bonus & allowance</span><strong>{formatCurrency(Number(selectedPayroll.bonus) + Number(selectedPayroll.allowance), selectedPayroll.currency)}</strong></div>
                  <div><span>Deductions & advance</span><strong>−{formatCurrency(Number(selectedPayroll.deductions) + Number(selectedPayroll.advance), selectedPayroll.currency)}</strong></div>
                  <div className="payroll-net"><span>Net salary</span><strong>{formatCurrency(Number(selectedPayroll.net_salary), selectedPayroll.currency)}</strong></div>
                </div>
                <div className="payroll-actions">
                  <button className="primary-button" type="button" disabled={!selectedPayroll.payslip_path || downloadingId === selectedPayroll.id} onClick={() => download(selectedPayroll, selectedEmployee)}>
                    {downloadingId === selectedPayroll.id ? 'Preparing…' : 'Download PDF'}
                  </button>
                  <button className="small-button" type="button" disabled={busy} onClick={refreshPayslip}>{busy ? 'Updating…' : 'Refresh PDF'}</button>
                  {selectedPayroll.status === 'finalized' && <button className="success-button small-button" type="button" disabled={busy} onClick={markPaid}>{busy ? 'Updating…' : 'Mark paid'}</button>}
                  <button className="outline-light-button" type="button" disabled={busy} onClick={reopenDraft}>Reopen draft</button>
                </div>
              </div>
            ) : null}
          </>
        )}

        {message && <p className="success-message payroll-message">{message}</p>}
        {error && <p className="error-message panel-message">{error}</p>}
      </section>

      <section className="content-card">
        <div className="card-title-row">
          <div>
            <p className="eyebrow">PAYROLL HISTORY</p>
            <h2>Monthly records</h2>
            <p className="section-copy">Draft, finalized and paid records for the full team.</p>
          </div>
          <span className="count-pill">{history.length}</span>
        </div>

        {history.length === 0 ? (
          <div className="empty-state">No payroll records yet.</div>
        ) : (
          <div className="payroll-history-list">
            {history.map((item) => {
              const employee = employees.find((entry) => entry.id === item.employee_id)
              return (
                <article className="payroll-history-card" key={item.id}>
                  <div>
                    <strong>{employee?.full_name || employee?.email || 'Employee'}</strong>
                    <p>{formatMonth(item.period_start)} • {item.present_days} present • {item.half_day_days || 0} half day</p>
                  </div>
                  <div className="payslip-side">
                    <strong>{formatCurrency(Number(item.net_salary), item.currency)}</strong>
                    <span className={`status-badge ${item.status === 'paid' ? 'approved' : item.status === 'finalized' ? 'pending' : ''}`}>{item.status}</span>
                    {item.payslip_path && employee && (
                      <button className="small-button" type="button" disabled={downloadingId === item.id} onClick={() => download(item, employee)}>
                        {downloadingId === item.id ? 'Preparing…' : 'PDF'}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function AttendancePanel({
  profile,
  profiles,
  attendance,
  onChanged,
  onBack,
}: {
  profile: Profile
  profiles: Profile[]
  attendance: AttendanceRecord[]
  onChanged: () => void
  onBack?: () => void
}) {
  const isAdmin = profile.role === 'admin'
  const employees = profiles.filter((item) => item.role === 'user')
  const attendanceSelectionKey = `aroma-attendance-employee-${profile.id}`
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue())
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(() => {
    if (!isAdmin) return profile.id
    const savedEmployeeId = localStorage.getItem(attendanceSelectionKey)
    if (savedEmployeeId && employees.some((item) => item.id === savedEmployeeId)) return savedEmployeeId
    return employees.find((item) => item.active)?.id || employees[0]?.id || ''
  })
  const [busyDate, setBusyDate] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!isAdmin) {
      if (selectedEmployeeId !== profile.id) setSelectedEmployeeId(profile.id)
      return
    }

    if (!employees.length) {
      if (selectedEmployeeId) setSelectedEmployeeId('')
      localStorage.removeItem(attendanceSelectionKey)
      return
    }

    const selectionStillExists = employees.some((item) => item.id === selectedEmployeeId)
    if (!selectionStillExists) {
      const fallbackEmployeeId = employees.find((item) => item.active)?.id || employees[0].id
      setSelectedEmployeeId(fallbackEmployeeId)
      localStorage.setItem(attendanceSelectionKey, fallbackEmployeeId)
      return
    }

    localStorage.setItem(attendanceSelectionKey, selectedEmployeeId)
  }, [attendanceSelectionKey, employees, isAdmin, profile.id, selectedEmployeeId])

  const selectedEmployee = profiles.find((item) => item.id === selectedEmployeeId) || employees.find((item) => item.active) || employees[0] || profile
  const monthRecords = attendance.filter(
    (item) => item.employee_id === selectedEmployeeId && item.work_date.startsWith(selectedMonth),
  )
  const recordByDate = new Map(monthRecords.map((item) => [item.work_date, item]))
  const dates = datesForMonth(selectedMonth)
  const summary = {
    present: monthRecords.filter((item) => item.status === 'present').length,
    absent: monthRecords.filter((item) => item.status === 'absent').length,
    halfDay: monthRecords.filter((item) => item.status === 'half_day').length,
    leave: monthRecords.filter((item) => item.status === 'leave').length,
  }

  async function setStatus(workDate: string, value: string) {
    if (!isAdmin || !selectedEmployeeId) return
    setBusyDate(workDate)
    setMessage('')
    const existing = recordByDate.get(workDate)

    if (!value) {
      if (existing) {
        const { error } = await supabase.from('attendance').delete().eq('id', existing.id)
        if (error) setMessage(error.message)
        else {
          setMessage(`Attendance cleared for ${formatDate(workDate)}.`)
          onChanged()
        }
      }
      setBusyDate('')
      return
    }

    const { error } = await supabase.from('attendance').upsert(
      {
        employee_id: selectedEmployeeId,
        work_date: workDate,
        status: value as AttendanceStatus,
        note: existing?.note || null,
        updated_by: profile.id,
      },
      { onConflict: 'employee_id,work_date' },
    )

    if (error) setMessage(error.message)
    else {
      setMessage(`${attendanceLabel(value as AttendanceStatus)} saved for ${formatDate(workDate)}.`)
      onChanged()
    }
    setBusyDate('')
  }

  async function editNote(workDate: string) {
    if (!isAdmin || !selectedEmployeeId) return
    const existing = recordByDate.get(workDate)
    if (!existing) {
      setMessage('Choose an attendance status before adding a note.')
      return
    }
    const entered = window.prompt('Attendance note (optional):', existing.note || '')
    if (entered === null) return

    setBusyDate(workDate)
    const { error } = await supabase
      .from('attendance')
      .update({ note: entered.trim() || null, updated_by: profile.id })
      .eq('id', existing.id)

    if (error) setMessage(error.message)
    else {
      setMessage(`Note updated for ${formatDate(workDate)}.`)
      onChanged()
    }
    setBusyDate('')
  }

  return (
    <div className="stacked-sections">
      {onBack && <EmployeeBackButton onBack={onBack} />}
      <section className="content-card">
        <div className="card-title-row attendance-heading">
          <div>
            <p className="eyebrow">{isAdmin ? 'TEAM ATTENDANCE' : 'MY ATTENDANCE'}</p>
            <h2>{isAdmin ? 'Attendance management' : 'Attendance calendar'}</h2>
            <p className="section-copy">
              {isAdmin ? 'Select an employee and mark each working day.' : 'Attendance is updated by your administrator.'}
            </p>
          </div>
        </div>

        <div className={`attendance-filters ${isAdmin ? '' : 'employee-attendance-filter'}`}>
          {isAdmin && (
            <label>
              Employee
              <select
                value={selectedEmployeeId}
                onChange={(event) => {
                  const nextEmployeeId = event.target.value
                  setSelectedEmployeeId(nextEmployeeId)
                  if (nextEmployeeId) localStorage.setItem(attendanceSelectionKey, nextEmployeeId)
                }}
              >
                {employees.length === 0 && <option value="">No employees</option>}
                {employees.map((employee) => (
                  <option value={employee.id} key={employee.id}>
                    {employee.full_name || employee.email || 'Employee'}{employee.active ? '' : ' (inactive)'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Month
            <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
          </label>
        </div>

        <div className="attendance-person-bar">
          <div className="employee-avatar">{(selectedEmployee.full_name || selectedEmployee.email || 'U').charAt(0).toUpperCase()}</div>
          <div>
            <strong>{selectedEmployee.full_name || selectedEmployee.email || 'Employee'}</strong>
            <span>{formatMonth(selectedMonth)}</span>
          </div>
        </div>

        <section className="attendance-summary-grid">
          <article className="attendance-summary present"><span>Present</span><strong>{summary.present}</strong></article>
          <article className="attendance-summary absent"><span>Absent</span><strong>{summary.absent}</strong></article>
          <article className="attendance-summary half-day"><span>Half day</span><strong>{summary.halfDay}</strong></article>
          <article className="attendance-summary leave"><span>Leave</span><strong>{summary.leave}</strong></article>
        </section>

        {!selectedEmployeeId ? (
          <div className="empty-state">Create an employee before recording attendance.</div>
        ) : isAdmin ? (
          <div className="attendance-table-wrap">
            <table className="attendance-table">
              <thead>
                <tr><th>Date</th><th>Day</th><th>Status</th><th>Note</th></tr>
              </thead>
              <tbody>
                {dates.map((date) => {
                  const record = recordByDate.get(date)
                  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(`${date}T12:00:00`))
                  return (
                    <tr key={date} className={record ? `attendance-row ${record.status}` : 'attendance-row'}>
                      <td><strong>{date.slice(-2)}</strong><span>{formatDate(date)}</span></td>
                      <td>{weekday}</td>
                      <td>
                        <select
                          className="attendance-status-select"
                          value={record?.status || ''}
                          disabled={busyDate === date}
                          onChange={(event) => setStatus(date, event.target.value)}
                        >
                          <option value="">Not marked</option>
                          <option value="present">Present</option>
                          <option value="absent">Absent</option>
                          <option value="half_day">Half day</option>
                          <option value="leave">Leave</option>
                        </select>
                      </td>
                      <td>
                        <button className="small-button attendance-note-button" type="button" disabled={busyDate === date} onClick={() => editNote(date)}>
                          {record?.note ? 'Edit note' : 'Add note'}
                        </button>
                        {record?.note && <small className="attendance-note-preview">{record.note}</small>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="employee-calendar-grid">
            {dates.map((date) => {
              const record = recordByDate.get(date)
              const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(`${date}T12:00:00`))
              return (
                <article className={`employee-day-card ${record?.status || 'unmarked'}`} key={date}>
                  <span>{weekday}</span>
                  <strong>{Number(date.slice(-2))}</strong>
                  <small>{record ? attendanceLabel(record.status) : 'Not marked'}</small>
                  {record?.note && <em>{record.note}</em>}
                </article>
              )
            })}
          </div>
        )}

        {message && <p className="form-message attendance-message">{message}</p>}
      </section>
    </div>
  )
}


function ProductManager({
  profile,
  products,
  onChanged,
}: {
  profile: Profile
  products: ProductRecord[]
  onChanged: () => void
}) {
  const emptyForm = {
    name: '',
    sku: '',
    category: productCategories[0],
    pack_size: '',
    selling_price: '',
    cost_price: '',
    currency: 'EUR',
    stock_quantity: '0',
    reorder_level: '0',
    description: '',
  }
  const [form, setForm] = useState(emptyForm)
  const [photo, setPhoto] = useState<File | null>(null)
  const [editing, setEditing] = useState<ProductRecord | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [replacementPhoto, setReplacementPhoto] = useState<File | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products.filter((item) => {
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && item.active)
        || (statusFilter === 'archived' && !item.active)
      const matchesSearch = !term
        || item.name.toLowerCase().includes(term)
        || item.sku.toLowerCase().includes(term)
        || item.category.toLowerCase().includes(term)
        || (item.pack_size || '').toLowerCase().includes(term)
      return matchesStatus && matchesSearch
    })
  }, [products, search, statusFilter])

  useEffect(() => {
    let cancelled = false
    async function loadPhotos() {
      const entries = await Promise.all(
        products
          .filter((item) => item.photo_path)
          .map(async (item) => {
            const { data } = await supabase.storage
              .from('product-images')
              .createSignedUrl(item.photo_path as string, 3600)
            return [item.id, data?.signedUrl || ''] as const
          }),
      )
      if (!cancelled) setPhotoUrls(Object.fromEntries(entries))
    }
    loadPhotos()
    return () => { cancelled = true }
  }, [products])

  function validate(values: typeof emptyForm) {
    if (!values.name.trim() || !values.sku.trim()) return 'Product name and SKU are required.'
    if (Number(values.selling_price) < 0 || values.selling_price === '') return 'Enter a valid selling price.'
    if (values.cost_price && Number(values.cost_price) < 0) return 'Cost price cannot be negative.'
    if (!Number.isFinite(Number(values.stock_quantity || 0)) || Number(values.stock_quantity || 0) < 0) return 'Stock cannot be negative.'
    if (!Number.isFinite(Number(values.reorder_level || 0)) || Number(values.reorder_level || 0) < 0) return 'Reorder level cannot be negative.'
    return ''
  }

  async function uploadPhoto(file: File, productId: string) {
    const compressed = await compressUploadImage(file)
    const path = `${profile.id}/${productId}/product-${Date.now()}.jpg`
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(path, compressed.blob, {
        contentType: compressed.contentType,
        cacheControl: '3600',
        upsert: false,
      })
    if (uploadError) throw uploadError
    return { path, originalBytes: compressed.originalBytes, compressedBytes: compressed.compressedBytes }
  }

  async function addProduct(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    setError('')
    const validation = validate(form)
    if (validation) {
      setError(validation)
      return
    }

    setBusy(true)
    const id = crypto.randomUUID()
    let photoPath: string | null = null
    let compressionMessage = ''

    try {
      if (photo) {
        const uploaded = await uploadPhoto(photo, id)
        photoPath = uploaded.path
        compressionMessage = ` Photo compressed from ${formatBytes(uploaded.originalBytes)} to ${formatBytes(uploaded.compressedBytes)}.`
      }

      const { error: insertError } = await supabase.from('products').insert({
        id,
        name: form.name.trim(),
        sku: form.sku.trim().toUpperCase(),
        category: form.category,
        pack_size: form.pack_size.trim() || null,
        selling_price: Number(form.selling_price),
        cost_price: form.cost_price ? Number(form.cost_price) : null,
        currency: form.currency,
        stock_quantity: Number(form.stock_quantity || 0),
        reorder_level: Number(form.reorder_level || 0),
        description: form.description.trim() || null,
        photo_path: photoPath,
        active: true,
        created_by: profile.id,
      })

      if (insertError) throw insertError
      setForm(emptyForm)
      setPhoto(null)
      setMessage(`Product added successfully.${compressionMessage}`)
      onChanged()
    } catch (caught) {
      if (photoPath) await supabase.storage.from('product-images').remove([photoPath])
      setError(caught instanceof Error ? caught.message : 'Unable to add the product.')
    }
    setBusy(false)
  }

  function beginEdit(product: ProductRecord) {
    setEditing(product)
    setEditForm({
      name: product.name,
      sku: product.sku,
      category: product.category,
      pack_size: product.pack_size || '',
      selling_price: String(product.selling_price),
      cost_price: product.cost_price === null ? '' : String(product.cost_price),
      currency: product.currency || 'EUR',
      stock_quantity: String(Number(product.stock_quantity || 0)),
      reorder_level: String(Number(product.reorder_level || 0)),
      description: product.description || '',
    })
    setReplacementPhoto(null)
    setRemovePhoto(false)
    setMessage('')
    setError('')
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    setMessage('')
    setError('')
    const validation = validate(editForm)
    if (validation) {
      setError(validation)
      return
    }

    setBusy(true)
    let nextPhotoPath: string | null = removePhoto ? null : editing.photo_path
    let uploadedPath: string | null = null

    try {
      if (replacementPhoto) {
        const uploaded = await uploadPhoto(replacementPhoto, editing.id)
        nextPhotoPath = uploaded.path
        uploadedPath = uploaded.path
      }

      const { error: updateError } = await supabase
        .from('products')
        .update({
          name: editForm.name.trim(),
          sku: editForm.sku.trim().toUpperCase(),
          category: editForm.category,
          pack_size: editForm.pack_size.trim() || null,
          selling_price: Number(editForm.selling_price),
          cost_price: editForm.cost_price ? Number(editForm.cost_price) : null,
          currency: editForm.currency,
          reorder_level: Number(editForm.reorder_level || 0),
          description: editForm.description.trim() || null,
          photo_path: nextPhotoPath,
        })
        .eq('id', editing.id)

      if (updateError) throw updateError

      if (editing.photo_path && editing.photo_path !== nextPhotoPath) {
        await supabase.storage.from('product-images').remove([editing.photo_path])
      }

      setEditing(null)
      setMessage('Product updated successfully.')
      onChanged()
    } catch (caught) {
      if (uploadedPath) await supabase.storage.from('product-images').remove([uploadedPath])
      setError(caught instanceof Error ? caught.message : 'Unable to update the product.')
    }
    setBusy(false)
  }

  async function toggleArchived(product: ProductRecord) {
    const action = product.active ? 'archive' : 'restore'
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${product.name}?`)) return
    setBusy(true)
    setMessage('')
    setError('')
    const { error: updateError } = await supabase
      .from('products')
      .update({ active: !product.active })
      .eq('id', product.id)
    if (updateError) setError(updateError.message)
    else {
      setMessage(product.active ? 'Product archived.' : 'Product restored.')
      onChanged()
    }
    setBusy(false)
  }

  const formFields = (
    values: typeof emptyForm,
    setValues: Dispatch<SetStateAction<typeof emptyForm>>,
    isEditing = false,
  ) => (
    <>
      <label>
        Product name
        <input value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} required />
      </label>
      <label>
        SKU / Product code
        <input value={values.sku} onChange={(event) => setValues((current) => ({ ...current, sku: event.target.value }))} placeholder="AC-CHILLI-100" required />
      </label>
      <label>
        Category
        <select value={values.category} onChange={(event) => setValues((current) => ({ ...current, category: event.target.value }))}>
          {productCategories.map((category) => <option key={category}>{category}</option>)}
        </select>
      </label>
      <label>
        Pack size
        <input value={values.pack_size} onChange={(event) => setValues((current) => ({ ...current, pack_size: event.target.value }))} placeholder="100 g" />
      </label>
      <label>
        Selling price
        <input type="number" min="0" step="0.01" inputMode="decimal" value={values.selling_price} onChange={(event) => setValues((current) => ({ ...current, selling_price: event.target.value }))} required />
      </label>
      <label>
        Cost price (optional)
        <input type="number" min="0" step="0.01" inputMode="decimal" value={values.cost_price} onChange={(event) => setValues((current) => ({ ...current, cost_price: event.target.value }))} />
      </label>
      <label>
        Currency
        <select value={values.currency} onChange={(event) => setValues((current) => ({ ...current, currency: event.target.value }))}>
          <option value="EUR">EUR</option>
          <option value="LKR">LKR</option>
        </select>
      </label>
      <label>
        {isEditing ? 'Current stock' : 'Opening stock'}
        <input type="number" min="0" step="0.001" value={values.stock_quantity} disabled={isEditing} onChange={(event) => setValues((current) => ({ ...current, stock_quantity: event.target.value }))} />
        {isEditing && <small className="field-help">Use Inventory → Stock adjustment so every change is recorded.</small>}
      </label>
      <label>
        Reorder level
        <input type="number" min="0" step="0.001" value={values.reorder_level} onChange={(event) => setValues((current) => ({ ...current, reorder_level: event.target.value }))} />
      </label>
      <label className="product-description-field">
        Description (optional)
        <textarea rows={3} value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} />
      </label>
    </>
  )

  return (
    <div className="stacked-sections">
      <section className="content-card">
        <div className="card-title-row">
          <div>
            <p className="eyebrow">PRODUCT CATALOGUE</p>
            <h2>Add a product</h2>
            <p className="section-copy">Create products now so they can be selected later in shop deliveries and invoices.</p>
          </div>
          <span className="gold-pill">Admin only</span>
        </div>
        <form className="product-form" onSubmit={addProduct}>
          {formFields(form, setForm)}
          <label className="upload-field product-photo-field">
            Product photo (optional)
            <input type="file" accept="image/*" onChange={(event) => setPhoto(event.target.files?.[0] || null)} />
            <span>{photo ? `${photo.name} • ${formatBytes(photo.size)}` : 'Choose a clear product or package photo.'}</span>
          </label>
          <button className="primary-button product-submit" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add product'}</button>
        </form>
        {message && <p className="success-message product-panel-message">{message}</p>}
        {error && <p className="error-message product-panel-message">{error}</p>}
      </section>

      <section className="content-card">
        <div className="card-title-row">
          <div>
            <p className="eyebrow">CATALOGUE</p>
            <h2>Products</h2>
            <p className="section-copy">Edit pricing and details, or archive products that are no longer sold.</p>
          </div>
          <span className="count-pill">{products.filter((item) => item.active).length}</span>
        </div>

        <div className="product-toolbar">
          <label>
            Search
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, SKU, category…" />
          </label>
          <label>
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>

        {visibleProducts.length === 0 ? (
          <div className="empty-state">No products match this view.</div>
        ) : (
          <div className="product-grid">
            {visibleProducts.map((product) => (
              <article className={`product-card ${product.active ? '' : 'archived'}`} key={product.id}>
                <div className="product-image-wrap">
                  {photoUrls[product.id]
                    ? <img src={photoUrls[product.id]} alt={product.name} />
                    : <div className="product-image-placeholder">{product.name.charAt(0).toUpperCase()}</div>}
                </div>
                <div className="product-card-body">
                  <div className="product-card-heading">
                    <div>
                      <span className="product-sku">{product.sku}</span>
                      <h3>{product.name}</h3>
                    </div>
                    <span className={`status-badge ${product.active ? 'approved' : 'rejected'}`}>{product.active ? 'active' : 'archived'}</span>
                  </div>
                  <p>{product.category}{product.pack_size ? ` • ${product.pack_size}` : ''}</p>
                  {product.description && <p className="product-description">{product.description}</p>}
                  <div className="product-stock-line"><span>Stock</span><strong>{Number(product.stock_quantity || 0).toFixed(3)}</strong><small>Reorder: {Number(product.reorder_level || 0).toFixed(3)}</small></div>
                  <div className="product-prices">
                    <div><span>Selling</span><strong>{formatCurrency(Number(product.selling_price || 0), product.currency)}</strong></div>
                    <div><span>Cost</span><strong>{product.cost_price === null ? '—' : formatCurrency(Number(product.cost_price), product.currency)}</strong></div>
                  </div>
                  <div className="product-actions">
                    <button className="edit-button" type="button" onClick={() => beginEdit(product)}>Edit</button>
                    <button className={product.active ? 'delete-button' : 'small-button success-button'} type="button" disabled={busy} onClick={() => toggleArchived(product)}>
                      {product.active ? 'Archive' : 'Restore'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditing(null)}>
          <section className="modal-card product-modal" role="dialog" aria-modal="true" aria-labelledby="product-edit-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="card-title-row">
              <div>
                <p className="eyebrow">PRODUCT CATALOGUE</p>
                <h2 id="product-edit-title">Edit product</h2>
                <p className="section-copy">{editing.sku}</p>
              </div>
              <button className="icon-close" type="button" onClick={() => setEditing(null)} aria-label="Close">×</button>
            </div>
            <form className="product-form" onSubmit={saveProduct}>
              {formFields(editForm, setEditForm, true)}
              <label className="upload-field product-photo-field">
                Replace product photo
                <input type="file" accept="image/*" onChange={(event) => setReplacementPhoto(event.target.files?.[0] || null)} />
                <span>{replacementPhoto ? `${replacementPhoto.name} • ${formatBytes(replacementPhoto.size)}` : 'Leave empty to keep the current photo.'}</span>
              </label>
              {editing.photo_path && (
                <label className="product-remove-photo">
                  <input type="checkbox" checked={removePhoto} onChange={(event) => setRemovePhoto(event.target.checked)} />
                  Remove current photo
                </label>
              )}
              <div className="modal-actions product-modal-actions">
                <button className="outline-light-button" type="button" onClick={() => setEditing(null)}>Cancel</button>
                <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button>
              </div>
            </form>
            {error && <p className="error-message product-panel-message">{error}</p>}
          </section>
        </div>
      )}
    </div>
  )
}


function ShopManager({
  profile,
  shops,
  onChanged,
}: {
  profile: Profile
  shops: ShopRecord[]
  onChanged: () => void
}) {
  const emptyForm = {
    shop_name: '',
    contact_person: '',
    phone: '',
    email: '',
    address_line_1: '',
    address_line_2: '',
    city: '',
    postal_code: '',
    country: 'Italy',
    vat_number: '',
    payment_terms: '30 days',
    default_currency: 'EUR',
    preferred_language: 'en' as AppLanguage,
    default_tax_rate: '0',
    default_discount: '0',
    preferred_payment_method: 'Bank transfer',
    notes: '',
  }

  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<ShopRecord | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const visibleShops = useMemo(() => {
    const term = search.trim().toLowerCase()
    return shops.filter((shop) => {
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && shop.active)
        || (statusFilter === 'archived' && !shop.active)
      const searchable = [
        shop.shop_code,
        shop.shop_name,
        shop.contact_person,
        shop.phone,
        shop.email,
        shop.city,
        shop.postal_code,
        shop.country,
        shop.vat_number,
      ].filter(Boolean).join(' ').toLowerCase()
      return matchesStatus && (!term || searchable.includes(term))
    })
  }, [shops, search, statusFilter])

  function validate(values: typeof emptyForm) {
    if (!values.shop_name.trim()) return 'Shop name is required.'
    if (values.email.trim() && !/^\S+@\S+\.\S+$/.test(values.email.trim())) return 'Enter a valid email address.'
    return ''
  }

  function payload(values: typeof emptyForm) {
    return {
      shop_name: values.shop_name.trim(),
      contact_person: values.contact_person.trim() || null,
      phone: values.phone.trim() || null,
      email: values.email.trim().toLowerCase() || null,
      address_line_1: values.address_line_1.trim() || null,
      address_line_2: values.address_line_2.trim() || null,
      city: values.city.trim() || null,
      postal_code: values.postal_code.trim() || null,
      country: values.country.trim() || 'Italy',
      vat_number: values.vat_number.trim() || null,
      payment_terms: values.payment_terms,
      default_currency: values.default_currency,
      preferred_language: values.preferred_language,
      default_tax_rate: Number(values.default_tax_rate || 0),
      default_discount: Number(values.default_discount || 0),
      preferred_payment_method: values.preferred_payment_method,
      notes: values.notes.trim() || null,
    }
  }

  async function addShop(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    setError('')
    const validation = validate(form)
    if (validation) {
      setError(validation)
      return
    }

    setBusy(true)
    const { error: insertError } = await supabase.from('shops').insert({
      ...payload(form),
      active: true,
      created_by: profile.id,
    })
    if (insertError) setError(insertError.message)
    else {
      setForm(emptyForm)
      setMessage('Shop added successfully. Its shop code was generated automatically.')
      onChanged()
    }
    setBusy(false)
  }

  function beginEdit(shop: ShopRecord) {
    setEditing(shop)
    setEditForm({
      shop_name: shop.shop_name,
      contact_person: shop.contact_person || '',
      phone: shop.phone || '',
      email: shop.email || '',
      address_line_1: shop.address_line_1 || '',
      address_line_2: shop.address_line_2 || '',
      city: shop.city || '',
      postal_code: shop.postal_code || '',
      country: shop.country || 'Italy',
      vat_number: shop.vat_number || '',
      payment_terms: shop.payment_terms || '30 days',
      default_currency: shop.default_currency || 'EUR',
      preferred_language: shop.preferred_language || 'en',
      default_tax_rate: String(Number(shop.default_tax_rate || 0)),
      default_discount: String(Number(shop.default_discount || 0)),
      preferred_payment_method: shop.preferred_payment_method || 'Bank transfer',
      notes: shop.notes || '',
    })
    setMessage('')
    setError('')
  }

  async function saveShop(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    setMessage('')
    setError('')
    const validation = validate(editForm)
    if (validation) {
      setError(validation)
      return
    }

    setBusy(true)
    const { error: updateError } = await supabase
      .from('shops')
      .update(payload(editForm))
      .eq('id', editing.id)
    if (updateError) setError(updateError.message)
    else {
      setEditing(null)
      setMessage('Shop details updated successfully.')
      onChanged()
    }
    setBusy(false)
  }

  async function toggleArchived(shop: ShopRecord) {
    const action = shop.active ? 'archive' : 'restore'
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${shop.shop_name}?`)) return
    setBusy(true)
    setMessage('')
    setError('')
    const { error: updateError } = await supabase
      .from('shops')
      .update({ active: !shop.active })
      .eq('id', shop.id)
    if (updateError) setError(updateError.message)
    else {
      setMessage(shop.active ? 'Shop archived.' : 'Shop restored.')
      onChanged()
    }
    setBusy(false)
  }

  const formFields = (
    values: typeof emptyForm,
    setValues: Dispatch<SetStateAction<typeof emptyForm>>,
    isEditing = false,
  ) => (
    <>
      <label>
        Shop name
        <input value={values.shop_name} onChange={(event) => setValues((current) => ({ ...current, shop_name: event.target.value }))} required />
      </label>
      <label>
        Contact person
        <input value={values.contact_person} onChange={(event) => setValues((current) => ({ ...current, contact_person: event.target.value }))} />
      </label>
      <label>
        Phone
        <input type="tel" value={values.phone} onChange={(event) => setValues((current) => ({ ...current, phone: event.target.value }))} />
      </label>
      <label>
        Email
        <input type="email" value={values.email} onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))} />
      </label>
      <label className="shop-wide-field">
        Address line 1
        <input value={values.address_line_1} onChange={(event) => setValues((current) => ({ ...current, address_line_1: event.target.value }))} placeholder="Street and building number" />
      </label>
      <label className="shop-wide-field">
        Address line 2 (optional)
        <input value={values.address_line_2} onChange={(event) => setValues((current) => ({ ...current, address_line_2: event.target.value }))} placeholder="Unit, floor or area" />
      </label>
      <label>
        City
        <input value={values.city} onChange={(event) => setValues((current) => ({ ...current, city: event.target.value }))} />
      </label>
      <label>
        Postal code
        <input value={values.postal_code} onChange={(event) => setValues((current) => ({ ...current, postal_code: event.target.value }))} />
      </label>
      <label>
        Country
        <input value={values.country} onChange={(event) => setValues((current) => ({ ...current, country: event.target.value }))} />
      </label>
      <label>
        VAT / Tax number (optional)
        <input value={values.vat_number} onChange={(event) => setValues((current) => ({ ...current, vat_number: event.target.value }))} />
      </label>
      <label>
        Payment terms
        <select value={values.payment_terms} onChange={(event) => setValues((current) => ({ ...current, payment_terms: event.target.value }))}>
          <option>Cash</option>
          <option>7 days</option>
          <option>15 days</option>
          <option>30 days</option>
        </select>
      </label>
      <label>
        Default currency
        <select value={values.default_currency} onChange={(event) => setValues((current) => ({ ...current, default_currency: event.target.value }))}>
          <option value="EUR">EUR</option>
          <option value="LKR">LKR</option>
        </select>
      </label>
      <label>
        Preferred language
        <select value={values.preferred_language} onChange={(event) => setValues((current) => ({ ...current, preferred_language: event.target.value as AppLanguage }))}>
          <option value="en">English</option>
          <option value="si">සිංහල</option>
        </select>
      </label>
      <label>
        Default VAT / Tax rate (%)
        <input type="number" min="0" max="100" step="0.001" value={values.default_tax_rate} onChange={(event) => setValues((current) => ({ ...current, default_tax_rate: event.target.value }))} />
      </label>
      <label>
        Default discount
        <input type="number" min="0" step="0.01" value={values.default_discount} onChange={(event) => setValues((current) => ({ ...current, default_discount: event.target.value }))} />
      </label>
      <label>
        Preferred payment method
        <select value={values.preferred_payment_method} onChange={(event) => setValues((current) => ({ ...current, preferred_payment_method: event.target.value }))}>
          <option>Cash</option><option>Bank transfer</option><option>Card</option><option>Other</option>
        </select>
      </label>
      <label className="shop-wide-field">
        Notes (optional)
        <textarea rows={3} value={values.notes} onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} />
      </label>
    </>
  )

  return (
    <div className="stacked-sections">
      <section className="content-card">
        <div className="card-title-row">
          <div>
            <p className="eyebrow">CUSTOMER DIRECTORY</p>
            <h2>Add a shop</h2>
            <p className="section-copy">Save customer details now so each delivery and invoice can be linked to the correct shop.</p>
          </div>
          <span className="gold-pill">Admin only</span>
        </div>
        <form className="shop-form" onSubmit={addShop}>
          {formFields(form, setForm)}
          <button className="primary-button shop-submit" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add shop'}</button>
        </form>
        {message && <p className="success-message shop-panel-message">{message}</p>}
        {error && <p className="error-message shop-panel-message">{error}</p>}
      </section>

      <section className="content-card">
        <div className="card-title-row">
          <div>
            <p className="eyebrow">SHOPS & CUSTOMERS</p>
            <h2>Shop directory</h2>
            <p className="section-copy">Search, update or archive customer profiles without losing future invoice history.</p>
          </div>
          <span className="count-pill">{shops.filter((shop) => shop.active).length}</span>
        </div>

        <div className="shop-toolbar">
          <label>
            Search
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, code, city, phone…" />
          </label>
          <label>
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>

        {visibleShops.length === 0 ? (
          <div className="empty-state">No shops match this view.</div>
        ) : (
          <div className="shop-grid">
            {visibleShops.map((shop) => {
              const address = [shop.address_line_1, shop.address_line_2, shop.city, shop.postal_code, shop.country].filter(Boolean).join(', ')
              return (
                <article className={`shop-card ${shop.active ? '' : 'archived'}`} key={shop.id}>
                  <div className="shop-card-heading">
                    <div className="shop-avatar">{shop.shop_name.charAt(0).toUpperCase()}</div>
                    <div className="shop-title-block">
                      <span className="shop-code">{shop.shop_code}</span>
                      <h3>{shop.shop_name}</h3>
                    </div>
                    <span className={`status-badge ${shop.active ? 'approved' : 'rejected'}`}>{shop.active ? 'active' : 'archived'}</span>
                  </div>

                  <div className="shop-details-grid">
                    <div><span>Contact</span><strong>{shop.contact_person || '—'}</strong></div>
                    <div><span>Phone</span><strong>{shop.phone || '—'}</strong></div>
                    <div><span>Payment terms</span><strong>{shop.payment_terms}</strong></div>
                    <div><span>Currency</span><strong>{shop.default_currency}</strong></div>
                  </div>

                  {address && <p className="shop-address">{address}</p>}
                  {shop.email && <p className="shop-contact-line">{shop.email}</p>}
                  {shop.vat_number && <p className="shop-contact-line">VAT / Tax: {shop.vat_number}</p>}
                  {shop.notes && <p className="shop-notes">{shop.notes}</p>}

                  <div className="shop-future-strip">
                    <span>Invoices & deliveries</span><strong>Available in Sales</strong>
                    <span>Payments</span><strong>Tracked in Sales</strong>
                  </div>

                  <div className="shop-actions">
                    <button className="edit-button" type="button" onClick={() => beginEdit(shop)}>Edit</button>
                    <button className={shop.active ? 'delete-button' : 'small-button success-button'} type="button" disabled={busy} onClick={() => toggleArchived(shop)}>
                      {shop.active ? 'Archive' : 'Restore'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditing(null)}>
          <section className="modal-card shop-modal" role="dialog" aria-modal="true" aria-labelledby="shop-edit-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="card-title-row">
              <div>
                <p className="eyebrow">CUSTOMER PROFILE</p>
                <h2 id="shop-edit-title">Edit shop</h2>
                <p className="section-copy">{editing.shop_code}</p>
              </div>
              <button className="icon-close" type="button" onClick={() => setEditing(null)} aria-label="Close">×</button>
            </div>
            <form className="shop-form" onSubmit={saveShop}>
              {formFields(editForm, setEditForm, true)}
              <div className="modal-actions shop-modal-actions">
                <button className="outline-light-button" type="button" onClick={() => setEditing(null)}>Cancel</button>
                <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save shop'}</button>
              </div>
            </form>
            {error && <p className="error-message shop-panel-message">{error}</p>}
          </section>
        </div>
      )}
    </div>
  )
}

function Dashboard({ profile }: { profile: Profile }) {
  const isAdmin = profile.role === 'admin'
  const androidApp = isAndroidApp()
  useAndroidPushRegistration(profile.id)
  const displayName = profile.full_name.trim() || (isAdmin ? 'Administrator' : 'Team Member')
  const [activeView, setActiveView] = useState<View>('dashboard')
  const [income, setIncome] = useState<IncomeRecord[]>([])
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([profile])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([])
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [shops, setShops] = useState<ShopRecord[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [pushThreadId, setPushThreadId] = useState<string | null>(null)
  const [language, setLanguage] = useState<AppLanguage>(() => {
    const saved = localStorage.getItem(`aroma-language-${profile.id}`)
    if (saved === 'si' || saved === 'en') return saved
    return profile.preferred_language === 'si' ? 'si' : 'en'
  })
  useAutoTranslate(language)

  async function changeLanguage(nextLanguage: AppLanguage) {
    setLanguage(nextLanguage)
    localStorage.setItem(`aroma-language-${profile.id}`, nextLanguage)
    const { error } = await supabase.rpc('set_my_language', { p_language: nextLanguage })
    if (error) setDataError(error.message)
  }

  const loadData = useCallback(async () => {
    // Keep the active screen mounted during background refreshes so local UI
    // state (for example the selected attendance employee) is preserved.
    setDataError('')

    const expenseRequest = supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })

    const attendanceRequest = supabase
      .from('attendance')
      .select('*')
      .order('work_date', { ascending: false })

    const payrollRequest = supabase
      .from('payrolls')
      .select('*')
      .order('period_start', { ascending: false })

    const incomeRequest = isAdmin
      ? supabase.from('income').select('*').order('received_date', { ascending: false }).order('created_at', { ascending: false })
      : null
    const profilesRequest = isAdmin
      ? supabase.from('profiles').select('id, full_name, email, role, active, job_title, phone, monthly_salary, salary_currency, preferred_language').order('full_name')
      : null
    const productsRequest = isAdmin
      ? supabase.from('products').select('*').order('name')
      : null
    const shopsRequest = isAdmin
      ? supabase.from('shops').select('*').order('shop_name')
      : null

    const results = await Promise.all([
      expenseRequest,
      attendanceRequest,
      payrollRequest,
      ...(incomeRequest ? [incomeRequest] : []),
      ...(profilesRequest ? [profilesRequest] : []),
      ...(productsRequest ? [productsRequest] : []),
      ...(shopsRequest ? [shopsRequest] : []),
    ])

    let index = 0
    const expenseResult = results[index++] as { data: ExpenseRecord[] | null; error: { message: string } | null }
    const attendanceResult = results[index++] as { data: AttendanceRecord[] | null; error: { message: string } | null }
    const payrollResult = results[index++] as { data: PayrollRecord[] | null; error: { message: string } | null }

    if (expenseResult.error) setDataError(expenseResult.error.message)
    if (attendanceResult.error) setDataError(attendanceResult.error.message)
    if (payrollResult.error) setDataError(payrollResult.error.message)

    setExpenses(expenseResult.data || [])
    setAttendance(attendanceResult.data || [])
    setPayrolls(payrollResult.data || [])

    if (incomeRequest) {
      const incomeResult = results[index++] as { data: IncomeRecord[] | null; error: { message: string } | null }
      if (incomeResult.error) setDataError(incomeResult.error.message)
      setIncome(incomeResult.data || [])
    }
    if (profilesRequest) {
      const profilesResult = results[index++] as { data: Profile[] | null; error: { message: string } | null }
      if (profilesResult.error) setDataError(profilesResult.error.message)
      setProfiles(profilesResult.data || [profile])
    } else {
      setProfiles([profile])
    }
    if (productsRequest) {
      const productsResult = results[index++] as { data: ProductRecord[] | null; error: { message: string } | null }
      if (productsResult.error) setDataError(productsResult.error.message)
      setProducts(productsResult.data || [])
    } else {
      setProducts([])
    }
    if (shopsRequest) {
      const shopsResult = results[index] as { data: ShopRecord[] | null; error: { message: string } | null }
      if (shopsResult.error) setDataError(shopsResult.error.message)
      setShops(shopsResult.data || [])
    } else {
      setShops([])
    }

    setLoadingData(false)
  }, [isAdmin, profile])

  useEffect(() => {
    loadData()
  }, [loadData])

  const loadUnreadMessages = useCallback(async () => {
    const { count, error } = await supabase
      .from('message_recipients')
      .select('thread_id', { count: 'exact', head: true })
      .eq('recipient_id', profile.id)
      .is('read_at', null)
    if (!error) setUnreadMessages(count || 0)
  }, [profile.id])

  useEffect(() => {
    loadUnreadMessages()
  }, [loadUnreadMessages, activeView])

  useEffect(() => {
    const channel = supabase
      .channel(`aroma-unread-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_recipients' }, loadUnreadMessages)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'thread_messages' }, loadUnreadMessages)
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [loadUnreadMessages, profile.id])

  useEffect(() => {
    if (!androidApp) return

    const pendingThread = consumeAndroidPendingThreadId()
    if (pendingThread) {
      setPushThreadId(pendingThread)
      setActiveView('messages')
    }

    function openPush(
  event: CustomEvent<{
    view?: string
    threadId?: string
    payrollId?: string
  }>,
) {
  const view = event.detail?.view

  if (view === 'messages') {
    const threadId =
      event.detail.threadId ||
      consumeAndroidPendingThreadId() ||
      null

    setPushThreadId(threadId)
    setActiveView('messages')
    consumeAndroidPendingThreadId()
    return
  }

  if (view === 'payslips') {
    setPushThreadId(null)
    setActiveView('payslips')
  }
}
    window.addEventListener('aroma-push-open', openPush)
    return () => window.removeEventListener('aroma-push-open', openPush)
  }, [androidApp])

  const profileNames = useMemo(() => {
    const map = new Map<string, string>()
    profiles.forEach((item) => map.set(item.id, item.full_name || item.email || 'User'))
    return map
  }, [profiles])

  const totals = useMemo(() => {
    const totalIncome = income.reduce((sum, item) => sum + Number(item.amount_lkr || 0), 0)
    const approvedExpenses = expenses
      .filter((item) => item.status === 'approved')
      .reduce((sum, item) => sum + Number(item.amount_lkr || 0), 0)
    const pendingExpenses = expenses.filter((item) => item.status === 'pending')
    return {
      totalIncome,
      approvedExpenses,
      net: totalIncome - approvedExpenses,
      pendingCount: pendingExpenses.length,
      pendingValue: pendingExpenses.reduce((sum, item) => sum + Number(item.amount_lkr || 0), 0),
    }
  }, [income, expenses])

  async function logout() {
    await disableCurrentAndroidPushDevice()
    await supabase.auth.signOut()
  }

  const navItems: { view: View; label: string }[] = isAdmin
    ? [
        { view: 'dashboard', label: 'Dashboard' },
        { view: 'income', label: 'Add income' },
        { view: 'expense', label: 'Add expense' },
        { view: 'approvals', label: 'Approvals' },
        { view: 'transactions', label: 'Transactions' },
        { view: 'employees', label: 'Employees' },
        { view: 'attendance', label: 'Attendance' },
        { view: 'payroll', label: 'Payroll' },
        { view: 'products', label: 'Products' },
        { view: 'shops', label: 'Shops' },
        { view: 'sales', label: 'Sales' },
        { view: 'inventory', label: 'Inventory' },
        { view: 'reports', label: 'Reports' },
        { view: 'messages', label: 'Messages' },
      ]
    : [
        { view: 'dashboard', label: 'Home' },
      ]

  const employeeBack = isAdmin ? undefined : () => setActiveView('dashboard')

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <img src={appIconUrl} alt="" />
          <div>
            <strong>Aroma Ceylon</strong>
            <span>{isAdmin ? 'Administrator' : 'Team Member'}</span>
          </div>
        </div>
        <div className="topbar-actions">
          <label className="language-select">
            <span>Language</span>
            <select value={language} onChange={(event) => changeLanguage(event.target.value as AppLanguage)}>
              <option value="en">English</option>
              <option value="si">සිංහල</option>
            </select>
          </label>
          <button className="outline-button" onClick={logout}>Sign out</button>
        </div>
      </header>

      <nav className={`app-nav ${isAdmin ? '' : 'employee-main-nav'}`} aria-label="Main navigation">
        {navItems.map((item) => (
          <button
            key={item.view}
            className={activeView === item.view ? 'active' : ''}
            onClick={() => setActiveView(item.view)}
          >
            {t(item.label, language)}
            {item.view === 'approvals' && totals.pendingCount > 0 && <span>{totals.pendingCount}</span>}
            {item.view === 'messages' && unreadMessages > 0 && <span>{unreadMessages}</span>}
          </button>
        ))}
      </nav>

      <main className="dashboard">
        {dataError && <div className="global-error">{dataError}</div>}

        {activeView === 'dashboard' && (
          isAdmin ? (
            <>
              <section className="welcome-panel">
                <p className="eyebrow">ADMIN CONTROL CENTRE</p>
                <h1>Hello, {displayName}</h1>
                {profile.email && <p className="welcome-email">{profile.email}</p>}
                <p>Income, approved expenses and business profit are connected to your secure Supabase database.</p>
              </section>

              <section className="finance-grid">
                <article className="finance-card income-card">
                  <span>Total income</span>
                  <strong>{formatLKR(totals.totalIncome)}</strong>
                  <small>Confirmed payments converted to LKR</small>
                </article>
                <article className="finance-card expense-card">
                  <span>Approved expenses</span>
                  <strong>{formatLKR(totals.approvedExpenses)}</strong>
                  <small>Only approved expenses affect cash profit</small>
                </article>
                <article className={`finance-card net-card ${totals.net < 0 ? 'loss' : 'gain'}`}>
                  <span>Cash profit / loss</span>
                  <strong>{totals.net >= 0 ? '+' : '−'}{formatLKR(Math.abs(totals.net))}</strong>
                  <small>{totals.net >= 0 ? 'Current profit' : 'Current loss'}</small>
                </article>
                <article className="finance-card pending-card">
                  <span>Pending approval</span>
                  <strong>{totals.pendingCount}</strong>
                  <small>{formatLKR(totals.pendingValue)} waiting</small>
                </article>
              </section>
            </>
          ) : (
            loadingData ? (
              <div className="content-card empty-state">Loading your workspace…</div>
            ) : (
              <EmployeeHome profile={profile} expenses={expenses} attendance={attendance} payrolls={payrolls} onOpen={setActiveView} language={language} unreadMessages={unreadMessages} />
            )
          )
        )}

        {activeView === 'income' && isAdmin && <IncomeForm profile={profile} onSaved={loadData} />}
        {activeView === 'expense' && (
          <div className="stacked-sections">
            {employeeBack && <EmployeeBackButton onBack={employeeBack} />}
            <ExpenseForm profile={profile} onSaved={loadData} />
          </div>
        )}
        {(activeView === 'approvals' || activeView === 'transactions') && (
          loadingData ? (
            <div className="content-card empty-state">Loading records…</div>
          ) : (
            <div className="stacked-sections">
              {activeView === 'transactions' && employeeBack && <EmployeeBackButton onBack={employeeBack} />}
              <TransactionsPanel
                profile={profile}
                income={activeView === 'approvals' ? [] : income}
                expenses={activeView === 'approvals' ? expenses.filter((item) => item.status === 'pending') : expenses}
                profileNames={profileNames}
                onChanged={loadData}
                mode={activeView === 'approvals' ? 'approvals' : 'transactions'}
              />
            </div>
          )
        )}
        {activeView === 'employees' && isAdmin && (
          loadingData ? (
            <div className="content-card empty-state">Loading employees…</div>
          ) : (
            <EmployeeManager currentProfile={profile} profiles={profiles} onChanged={loadData} />
          )
        )}
        {activeView === 'attendance' && (
          loadingData ? (
            <div className="content-card empty-state">Loading attendance…</div>
          ) : (
            <AttendancePanel
              profile={profile}
              profiles={profiles}
              attendance={attendance}
              onChanged={loadData}
              onBack={employeeBack}
            />
          )
        )}
        {activeView === 'payroll' && isAdmin && (
          loadingData ? (
            <div className="content-card empty-state">Loading payroll…</div>
          ) : (
            <PayrollManager
              profile={profile}
              profiles={profiles}
              attendance={attendance}
              payrolls={payrolls}
              onChanged={loadData}
            />
          )
        )}
        {activeView === 'products' && isAdmin && (
          loadingData ? (
            <div className="content-card empty-state">Loading products…</div>
          ) : (
            <ProductManager profile={profile} products={products} onChanged={loadData} />
          )
        )}
        {activeView === 'shops' && isAdmin && (
          loadingData ? (
            <div className="content-card empty-state">Loading shops…</div>
          ) : (
            <ShopManager profile={profile} shops={shops} onChanged={loadData} />
          )
        )}
        {activeView === 'sales' && isAdmin && (
          loadingData ? (
            <div className="content-card empty-state">Loading sales workspace…</div>
          ) : (
            <SalesManager profile={profile} shops={shops} products={products} onChanged={loadData} />
          )
        )}
        {activeView === 'messages' && (
          loadingData ? (
            <div className="content-card empty-state">Loading messages…</div>
          ) : (
            <div className="stacked-sections">
              {employeeBack && <EmployeeBackButton onBack={employeeBack} />}
              <MessagesCenter profile={profile} profiles={profiles} language={language} onUnreadChanged={loadUnreadMessages} initialThreadId={pushThreadId} onInitialThreadHandled={() => setPushThreadId(null)} />
            </div>
          )
        )}
        {activeView === 'inventory' && isAdmin && (
          loadingData ? (
            <div className="content-card empty-state">Loading inventory…</div>
          ) : (
            <OperationsHub mode="inventory" products={products} shops={shops} language={language} onChanged={loadData} />
          )
        )}
        {activeView === 'reports' && isAdmin && (
          loadingData ? (
            <div className="content-card empty-state">Loading reports…</div>
          ) : (
            <OperationsHub mode="reports" products={products} shops={shops} language={language} onChanged={loadData} />
          )
        )}
        {activeView === 'payslips' && !isAdmin && (
          loadingData ? (
            <div className="content-card empty-state">Loading payslips…</div>
          ) : (
            <PayslipsPanel profile={profile} payrolls={payrolls} onBack={employeeBack} />
          )
        )}
        {activeView === 'profile' && !isAdmin && <ProfilePanel profile={profile} onBack={employeeBack} onContactAdmin={() => setActiveView('messages')} language={language} />}
      </main>
      {androidApp && !isAdmin && (
        <AndroidEmployeeBottomNav
          activeView={activeView}
          onOpen={setActiveView}
          unreadMessages={unreadMessages}
          language={language}
        />
      )}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [fatalError, setFatalError] = useState('')
  const [inviteMode, setInviteMode] = useState(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)
    return hash.get('type') === 'invite' || query.get('type') === 'invite'
  })

  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
  setSession(nextSession)

  if (event === 'PASSWORD_RECOVERY') {
    setRecoveryMode(true)
  }

  if (!nextSession) {
    setProfile(null)
  }
})

    return () => authListener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function loadProfile() {
      if (!session?.user) {
        setLoading(false)
        return
      }

      setLoading(true)
      setFatalError('')

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, active, job_title, phone, monthly_salary, salary_currency, preferred_language')
        .eq('id', session.user.id)
        .single()

      if (error) {
        setFatalError(error.message)
        setProfile(null)
      } else if (!data.active) {
        await supabase.auth.signOut()
        setFatalError('This account is inactive. Please contact the administrator.')
      } else {
        setProfile(data as Profile)
      }

      setLoading(false)
    }

    loadProfile()
  }, [session])

  if (loading) {
    return (
      <main className="loading-page">
        <img src={appIconUrl} alt="Aroma Ceylon" />
        <p>Loading secure workspace…</p>
      </main>
    )
  }

  if (!session) return <LoginScreen />

  if (recoveryMode) {
  return (
    <PasswordSetupScreen
      mode="recovery"
      onComplete={() => setRecoveryMode(false)}
    />
  )
}

  if (inviteMode) return <PasswordSetupScreen onComplete={() => setInviteMode(false)} />

  if (fatalError) {
    return (
      <main className="loading-page">
        <div className="fatal-card">
          <h1>Unable to open the workspace</h1>
          <p>{fatalError}</p>
          <button className="primary-button" onClick={() => supabase.auth.signOut()}>
            Return to login
          </button>
        </div>
      </main>
    )
  }

  return profile ? <Dashboard profile={profile} /> : null
}
