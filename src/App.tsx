import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type Role = 'admin' | 'user'
type ExpenseStatus = 'pending' | 'approved' | 'rejected'
type View = 'dashboard' | 'income' | 'expense' | 'approvals' | 'transactions'

type Profile = {
  id: string
  full_name: string
  email: string | null
  role: Role
  active: boolean
  job_title: string | null
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
  extension: 'webp' | 'jpg'
  contentType: string
  originalBytes: number
  compressedBytes: number
}

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
  const bitmap = await createImageBitmap(file)
  const maxDimension = 1600
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to prepare the bill image.')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

  let blob = await toBlob('image/webp', 0.66)
  let extension: 'webp' | 'jpg' = 'webp'
  let contentType = 'image/webp'

  if (!blob) {
    blob = await toBlob('image/jpeg', 0.68)
    extension = 'jpg'
    contentType = 'image/jpeg'
  }

  if (!blob) throw new Error('Unable to compress the bill image.')

  return {
    blob,
    extension,
    contentType,
    originalBytes: file.size,
    compressedBytes: blob.size,
  }
}

function StatusBadge({ status }: { status: ExpenseStatus }) {
  return <span className={`status-badge ${status}`}>{status}</span>
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

  const pending = expenses.filter((item) => item.status === 'pending')
  const otherExpenses = expenses.filter((item) => item.status !== 'pending')

  return (
    <div className="stacked-sections">
      {isAdmin && (
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
                      <button className="approve-button" disabled={busyId === item.id} onClick={() => review(item, 'approved')}>Approve</button>
                      <button className="reject-button" disabled={busyId === item.id} onClick={() => review(item, 'rejected')}>Reject</button>
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
              <h2>{isAdmin ? 'Reviewed expenses' : 'My submissions'}</h2>
            </div>
          </div>
          {otherExpenses.length === 0 ? (
            <div className="empty-state">No reviewed expenses yet.</div>
          ) : (
            <div className="record-list">
              {otherExpenses.map((item) => (
                <article className="record-card compact" key={item.id}>
                  <div className="record-main">
                    <div className="record-title-line">
                      <strong>{item.title}</strong>
                      <StatusBadge status={item.status} />
                    </div>
                    <p>{item.category} • {formatDate(item.expense_date)}{isAdmin ? ` • ${profileNames.get(item.submitted_by) || 'User'}` : ''}</p>
                    {item.rejection_reason && <p className="rejection-note">Reason: {item.rejection_reason}</p>}
                  </div>
                  <div className="record-side">
                    <strong className="expense-value">−{formatLKR(item.amount_lkr)}</strong>
                    {item.bill_path && <button className="small-button" onClick={() => openBill(item.bill_path!)}>View bill</button>}
                  </div>
                </article>
              ))}
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
                  <strong className="income-value">+{formatLKR(item.amount_lkr)}</strong>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Dashboard({ profile }: { profile: Profile }) {
  const isAdmin = profile.role === 'admin'
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
      ? supabase.from('profiles').select('id, full_name, email, role, active, job_title').order('full_name')
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
              <h1>Hello, {profile.full_name || profile.email || 'Team Member'}</h1>
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

            <section className="quick-actions">
              <button onClick={() => setActiveView(isAdmin ? 'income' : 'expense')}>
                <span>{isAdmin ? '＋' : '↗'}</span>
                <strong>{isAdmin ? 'Record income' : 'Submit expense'}</strong>
                <small>{isAdmin ? 'Add a received EUR payment' : 'Add amount, note and bill photo'}</small>
              </button>
              {isAdmin && (
                <button onClick={() => setActiveView('approvals')}>
                  <span>✓</span>
                  <strong>Review expenses</strong>
                  <small>{totals.pendingCount} waiting for your decision</small>
                </button>
              )}
              <button onClick={() => setActiveView('transactions')}>
                <span>≡</span>
                <strong>{isAdmin ? 'View transactions' : 'My submissions'}</strong>
                <small>See recent business records</small>
              </button>
            </section>
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
      </main>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [fatalError, setFatalError] = useState('')

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
        .select('id, full_name, email, role, active, job_title')
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
