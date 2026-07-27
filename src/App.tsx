import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type Role = 'admin' | 'user'
type ExpenseStatus = 'pending' | 'approved' | 'rejected'
type View = 'dashboard' | 'income' | 'expense' | 'approvals' | 'transactions' | 'employees'

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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function compressBillImage(file: File): Promise<CompressedImage> {
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
    throw new Error('Unable to prepare the bill image.')
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
  if (!blob) throw new Error('Unable to compress the bill image.')
  if (blob.size > 1_500_000) {
    throw new Error('The photo is still too large. Please crop the bill and try again.')
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


function PasswordSetupScreen({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

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
        <img className="brand-logo" src="/aroma-logo.png" alt="Aroma Ceylon" />
        <div className="brand-divider" />
        <p className="eyebrow">EMPLOYEE INVITATION</p>
        <h1>Create your password</h1>
        <p className="muted">Set a secure password to finish activating your Aroma Ceylon account.</p>

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
            {busy ? 'Saving…' : 'Activate account'}
          </button>
        </form>
      </section>
    </main>
  )
}

function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function login(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage(error.message)
    setBusy(false)
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <img className="brand-logo" src="/aroma-logo.png" alt="Aroma Ceylon" />
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
        const compressed = await compressBillImage(bill)
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
        const compressed = await compressBillImage(replacementBill)
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
                const canChange = isAdmin || (item.submitted_by === profile.id && item.status === 'pending')
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
                    <p>{formatDate(item.received_date)} • {formatEUR(item.amount_eur)} × {Number(item.exchange_rate).toFixed(4)}</p>
                    {item.note && <p className="record-note">{item.note}</p>}
                  </div>
                  <div className="record-side">
                    <strong className="income-value">+{formatLKR(item.amount_lkr)}</strong>
                    <div className="record-actions">
                      <button className="edit-button" onClick={() => setEditing({ kind: 'income', record: item })}>Edit</button>
                      <button className="delete-button" disabled={busyId === item.id} onClick={() => deleteIncome(item)}>Delete</button>
                    </div>
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

function Dashboard({ profile }: { profile: Profile }) {
  const isAdmin = profile.role === 'admin'
  const displayName = profile.full_name.trim() || (isAdmin ? 'Administrator' : 'Team Member')
  const [activeView, setActiveView] = useState<View>('dashboard')
  const [income, setIncome] = useState<IncomeRecord[]>([])
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([profile])
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')

  const loadData = useCallback(async () => {
    setLoadingData(true)
    setDataError('')

    const expenseRequest = supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })

    const requests: PromiseLike<unknown>[] = [expenseRequest]
    const incomeRequest = isAdmin
      ? supabase.from('income').select('*').order('received_date', { ascending: false }).order('created_at', { ascending: false })
      : null
    const profilesRequest = isAdmin
      ? supabase.from('profiles').select('id, full_name, email, role, active, job_title, phone, monthly_salary, salary_currency').order('full_name')
      : null

    if (incomeRequest) requests.push(incomeRequest)
    if (profilesRequest) requests.push(profilesRequest)

    const results = await Promise.all(requests)
    const expenseResult = results[0] as { data: ExpenseRecord[] | null; error: { message: string } | null }
    if (expenseResult.error) setDataError(expenseResult.error.message)
    setExpenses(expenseResult.data || [])

    let index = 1
    if (incomeRequest) {
      const incomeResult = results[index++] as { data: IncomeRecord[] | null; error: { message: string } | null }
      if (incomeResult.error) setDataError(incomeResult.error.message)
      setIncome(incomeResult.data || [])
    }
    if (profilesRequest) {
      const profilesResult = results[index] as { data: Profile[] | null; error: { message: string } | null }
      if (profilesResult.error) setDataError(profilesResult.error.message)
      setProfiles(profilesResult.data || [profile])
    }

    setLoadingData(false)
  }, [isAdmin, profile])

  useEffect(() => {
    loadData()
  }, [loadData])

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
      ]
    : [
        { view: 'dashboard', label: 'Dashboard' },
        { view: 'expense', label: 'Submit expense' },
        { view: 'transactions', label: 'My submissions' },
      ]

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <img src="/icon-192.png" alt="" />
          <div>
            <strong>Aroma Ceylon</strong>
            <span>{isAdmin ? 'Administrator' : 'Team Member'}</span>
          </div>
        </div>
        <button className="outline-button" onClick={logout}>Sign out</button>
      </header>

      <nav className="app-nav" aria-label="Main navigation">
        {navItems.map((item) => (
          <button
            key={item.view}
            className={activeView === item.view ? 'active' : ''}
            onClick={() => setActiveView(item.view)}
          >
            {item.label}
            {item.view === 'approvals' && totals.pendingCount > 0 && <span>{totals.pendingCount}</span>}
          </button>
        ))}
      </nav>

      <main className="dashboard">
        {dataError && <div className="global-error">{dataError}</div>}

        {activeView === 'dashboard' && (
          <>
            <section className="welcome-panel">
              <p className="eyebrow">{isAdmin ? 'ADMIN CONTROL CENTRE' : 'MY WORKSPACE'}</p>
              <h1>Hello, {displayName}</h1>
              {profile.email && <p className="welcome-email">{profile.email}</p>}
              <p>
                {isAdmin
                  ? 'Income, approved expenses and business profit are now connected to your Supabase database.'
                  : 'Submit business expenses and track their approval status securely.'}
              </p>
            </section>

            {isAdmin ? (
              <section className="finance-grid">
                <article className="finance-card income-card">
                  <span>Total income</span>
                  <strong>{formatLKR(totals.totalIncome)}</strong>
                  <small>Confirmed EUR payments converted to LKR</small>
                </article>
                <article className="finance-card expense-card">
                  <span>Approved expenses</span>
                  <strong>{formatLKR(totals.approvedExpenses)}</strong>
                  <small>Only approved expenses affect profit</small>
                </article>
                <article className={`finance-card net-card ${totals.net < 0 ? 'loss' : 'gain'}`}>
                  <span>Net profit / loss</span>
                  <strong>{totals.net >= 0 ? '+' : '−'}{formatLKR(Math.abs(totals.net))}</strong>
                  <small>{totals.net >= 0 ? 'Current profit' : 'Current loss'}</small>
                </article>
                <article className="finance-card pending-card">
                  <span>Pending approval</span>
                  <strong>{totals.pendingCount}</strong>
                  <small>{formatLKR(totals.pendingValue)} waiting</small>
                </article>
              </section>
            ) : (
              <section className="finance-grid user-finance-grid">
                <article className="finance-card pending-card">
                  <span>Pending submissions</span>
                  <strong>{expenses.filter((item) => item.status === 'pending').length}</strong>
                  <small>Waiting for admin review</small>
                </article>
                <article className="finance-card income-card">
                  <span>Approved</span>
                  <strong>{expenses.filter((item) => item.status === 'approved').length}</strong>
                  <small>Your accepted expenses</small>
                </article>
                <article className="finance-card expense-card">
                  <span>Rejected</span>
                  <strong>{expenses.filter((item) => item.status === 'rejected').length}</strong>
                  <small>Check the reason in submissions</small>
                </article>
              </section>
            )}

          </>
        )}

        {activeView === 'income' && isAdmin && <IncomeForm profile={profile} onSaved={loadData} />}
        {activeView === 'expense' && <ExpenseForm profile={profile} onSaved={loadData} />}
        {(activeView === 'approvals' || activeView === 'transactions') && (
          loadingData ? (
            <div className="content-card empty-state">Loading records…</div>
          ) : (
            <TransactionsPanel
              profile={profile}
              income={activeView === 'approvals' ? [] : income}
              expenses={activeView === 'approvals' ? expenses.filter((item) => item.status === 'pending') : expenses}
              profileNames={profileNames}
              onChanged={loadData}
              mode={activeView === 'approvals' ? 'approvals' : 'transactions'}
            />
          )
        )}
        {activeView === 'employees' && isAdmin && (
          loadingData ? (
            <div className="content-card empty-state">Loading employees…</div>
          ) : (
            <EmployeeManager currentProfile={profile} profiles={profiles} onChanged={loadData} />
          )
        )}
      </main>
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) setProfile(null)
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
        .select('id, full_name, email, role, active, job_title, phone, monthly_salary, salary_currency')
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
        <img src="/icon-192.png" alt="Aroma Ceylon" />
        <p>Loading secure workspace…</p>
      </main>
    )
  }

  if (!session) return <LoginScreen />

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
