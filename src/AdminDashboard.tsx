import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type DashboardView =
  | 'dashboard'
  | 'income'
  | 'expense'
  | 'approvals'
  | 'transactions'
  | 'employees'
  | 'attendance'
  | 'payroll'
  | 'products'
  | 'shops'
  | 'sales'
  | 'inventory'
  | 'reports'
  | 'messages'

type IncomeLike = {
  id: string
  store_name: string
  received_date: string
  amount_lkr: number
  created_at: string
  source_type?: string | null
  source_currency?: string | null
  source_amount?: number | null
}

type ExpenseLike = {
  id: string
  title: string
  category: string
  amount_lkr: number
  expense_date: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewed_at: string | null
}

type PayrollLike = {
  id: string
  employee_id: string
  period_start: string
  currency: string
  net_salary: number
  status: 'draft' | 'finalized' | 'paid'
  paid_at: string | null
  created_at?: string
}

type ProductLike = {
  id: string
  name: string
  sku: string
  pack_size: string | null
  currency: string
  cost_price: number | null
  stock_quantity?: number
  reorder_level?: number
  active: boolean
}

type ShopLike = {
  id: string
  shop_name: string
  city: string | null
}

type ProfileLike = {
  id: string
  full_name: string
  email: string | null
}

type Invoice = {
  id: string
  invoice_code: string
  shop_id: string
  invoice_date: string
  due_date: string
  total_amount: number
  credited_amount?: number
  balance_amount: number
  currency: string
  status: string
  is_test?: boolean
  created_at: string
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

type AdminDashboardProps = {
  displayName: string
  email: string | null
  income: IncomeLike[]
  expenses: ExpenseLike[]
  payrolls: PayrollLike[]
  products: ProductLike[]
  shops: ShopLike[]
  profiles: ProfileLike[]
  loadingData: boolean
  refreshToken: number
  onOpen: (view: DashboardView) => void
  onRefresh: () => void
}

type Activity = {
  id: string
  kind: 'income' | 'expense' | 'approval' | 'invoice' | 'stock' | 'payroll'
  label: string
  title: string
  detail: string
  at: string
  view: DashboardView
}

function monthKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 7)
}

function previousMonthKey() {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() - 1)
  return monthKey(date)
}

function localDateKey(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function formatLKR(value: number) {
  return `LKR ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0))
  } catch {
    return `${currency} ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
}

function dateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function comparison(current: number, previous: number, inverse = false) {
  if (previous === 0) {
    if (current === 0) return { text: 'No change vs last month', direction: 'flat' as const }
    return { text: 'New activity this month', direction: inverse ? 'bad' as const : 'good' as const }
  }
  const percent = ((current - previous) / Math.abs(previous)) * 100
  if (Math.abs(percent) < 0.05) return { text: 'No change vs last month', direction: 'flat' as const }
  const rising = percent > 0
  const good = inverse ? !rising : rising
  return {
    text: `${rising ? '↑' : '↓'} ${Math.abs(percent).toFixed(1)}% vs last month`,
    direction: good ? 'good' as const : 'bad' as const,
  }
}

function CurrencySummary({ values, empty = 'No data' }: { values: Record<string, number>; empty?: string }) {
  const entries = Object.entries(values).filter(([, value]) => Math.abs(value) > 0.005)
  if (entries.length === 0) return <strong className="admin-currency-empty">{empty}</strong>
  return (
    <div className="admin-currency-values">
      {entries.map(([currency, value]) => <strong key={currency}>{money(Number(value), currency)}</strong>)}
    </div>
  )
}

function TrendChart({ income, expenses }: { income: IncomeLike[]; expenses: ExpenseLike[] }) {
  const data = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, index) => {
      const date = new Date()
      date.setHours(12, 0, 0, 0)
      date.setDate(date.getDate() - (29 - index))
      const key = localDateKey(date)
      return { key, label: `${date.getDate()} ${date.toLocaleString('en-GB', { month: 'short' })}`, received: 0, spent: 0 }
    })
    const byDay = new Map(days.map((day) => [day.key, day]))
    income.forEach((row) => {
      const day = byDay.get(row.received_date)
      if (day) day.received += Number(row.amount_lkr || 0)
    })
    expenses.filter((row) => row.status === 'approved').forEach((row) => {
      const day = byDay.get(row.expense_date)
      if (day) day.spent += Number(row.amount_lkr || 0)
    })
    return days
  }, [income, expenses])

  const width = 760
  const height = 255
  const left = 46
  const right = 16
  const top = 18
  const bottom = 36
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const maxValue = Math.max(1, ...data.flatMap((row) => [row.received, row.spent]))
  const roundMax = Math.max(1000, Math.ceil(maxValue / 1000) * 1000)
  const x = (index: number) => left + (index / Math.max(1, data.length - 1)) * plotWidth
  const y = (value: number) => top + plotHeight - (value / roundMax) * plotHeight
  const receivedPoints = data.map((row, index) => `${x(index).toFixed(1)},${y(row.received).toFixed(1)}`).join(' ')
  const spentPoints = data.map((row, index) => `${x(index).toFixed(1)},${y(row.spent).toFixed(1)}`).join(' ')
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => roundMax * ratio)

  return (
    <div className="admin-chart-wrap">
      <div className="admin-chart-legend">
        <span><i className="chart-dot received" />Cash received</span>
        <span><i className="chart-dot spent" />Approved expenses</span>
      </div>
      <svg className="admin-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Last 30 days cash received and approved expenses in LKR">
        {gridValues.map((value) => (
          <g key={value}>
            <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="chart-grid-line" />
            <text x={left - 8} y={y(value) + 4} textAnchor="end" className="chart-axis-label">
              {value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : value.toFixed(0)}
            </text>
          </g>
        ))}
        <polyline points={receivedPoints} className="chart-line received" />
        <polyline points={spentPoints} className="chart-line spent" />
        {data.map((row, index) => index % 6 === 0 || index === data.length - 1 ? (
          <text key={row.key} x={x(index)} y={height - 10} textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'} className="chart-x-label">{row.label}</text>
        ) : null)}
      </svg>
    </div>
  )
}

export function AdminDashboard({
  displayName,
  email,
  income,
  expenses,
  payrolls,
  products,
  shops,
  profiles,
  loadingData,
  refreshToken,
  onOpen,
  onRefresh,
}: AdminDashboardProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([])
  const [dashboardError, setDashboardError] = useState('')
  const [dashboardLoading, setDashboardLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadDashboardData() {
      setDashboardLoading(true)
      setDashboardError('')
      const [invoiceResult, movementResult] = await Promise.all([
        supabase
          .from('sales_invoices')
          .select('id,invoice_code,shop_id,invoice_date,due_date,total_amount,credited_amount,balance_amount,currency,status,is_test,created_at')
          .order('invoice_date', { ascending: false })
          .limit(300),
        supabase
          .from('stock_movements')
          .select('id,product_id,movement_type,quantity,balance_after,reason,created_at')
          .order('created_at', { ascending: false })
          .limit(100),
      ])
      if (cancelled) return
      const firstError = invoiceResult.error || movementResult.error
      if (firstError) setDashboardError(firstError.message)
      if (!invoiceResult.error) setInvoices((invoiceResult.data || []) as Invoice[])
      if (!movementResult.error) setStockMovements((movementResult.data || []) as StockMovement[])
      setDashboardLoading(false)
    }
    void loadDashboardData()
    return () => { cancelled = true }
  }, [refreshToken])

  const currentMonth = monthKey()
  const previousMonth = previousMonthKey()
  const shopMap = useMemo(() => new Map(shops.map((shop) => [shop.id, shop])), [shops])
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])

  const cashThisMonth = useMemo(
    () => income.filter((row) => row.received_date?.slice(0, 7) === currentMonth).reduce((sum, row) => sum + Number(row.amount_lkr || 0), 0),
    [income, currentMonth],
  )
  const cashLastMonth = useMemo(
    () => income.filter((row) => row.received_date?.slice(0, 7) === previousMonth).reduce((sum, row) => sum + Number(row.amount_lkr || 0), 0),
    [income, previousMonth],
  )
  const expenseThisMonth = useMemo(
    () => expenses.filter((row) => row.status === 'approved' && row.expense_date?.slice(0, 7) === currentMonth).reduce((sum, row) => sum + Number(row.amount_lkr || 0), 0),
    [expenses, currentMonth],
  )
  const expenseLastMonth = useMemo(
    () => expenses.filter((row) => row.status === 'approved' && row.expense_date?.slice(0, 7) === previousMonth).reduce((sum, row) => sum + Number(row.amount_lkr || 0), 0),
    [expenses, previousMonth],
  )
  const pending = useMemo(() => expenses.filter((row) => row.status === 'pending'), [expenses])
  const cashProfit = cashThisMonth - expenseThisMonth
  const lastCashProfit = cashLastMonth - expenseLastMonth

  const validInvoices = useMemo(
    () => invoices.filter((invoice) => !invoice.is_test && !['draft', 'cancelled'].includes(invoice.status)),
    [invoices],
  )

  const monthlySalesByCurrency = useMemo(() => {
    const result: Record<string, number> = {}
    validInvoices.filter((invoice) => invoice.invoice_date?.slice(0, 7) === currentMonth).forEach((invoice) => {
      result[invoice.currency] = (result[invoice.currency] || 0) + Math.max(Number(invoice.total_amount || 0) - Number(invoice.credited_amount || 0), 0)
    })
    return result
  }, [validInvoices, currentMonth])

  const outstandingByCurrency = useMemo(() => {
    const result: Record<string, number> = {}
    invoices.filter((invoice) => !invoice.is_test && !['draft', 'cancelled', 'paid'].includes(invoice.status)).forEach((invoice) => {
      result[invoice.currency] = (result[invoice.currency] || 0) + Math.max(Number(invoice.balance_amount || 0), 0)
    })
    return result
  }, [invoices])

  const inventoryValueByCurrency = useMemo(() => {
    const result: Record<string, number> = {}
    products.filter((product) => product.active).forEach((product) => {
      const value = Number(product.stock_quantity || 0) * Number(product.cost_price || 0)
      result[product.currency] = (result[product.currency] || 0) + value
    })
    return result
  }, [products])

  const salaryDueByCurrency = useMemo(() => {
    const result: Record<string, number> = {}
    payrolls.filter((row) => row.status === 'finalized').forEach((row) => {
      result[row.currency] = (result[row.currency] || 0) + Number(row.net_salary || 0)
    })
    return result
  }, [payrolls])

  const lowStock = useMemo(
    () => products
      .filter((product) => product.active && Number(product.stock_quantity || 0) <= Number(product.reorder_level || 0))
      .sort((a, b) => (Number(a.stock_quantity || 0) - Number(a.reorder_level || 0)) - (Number(b.stock_quantity || 0) - Number(b.reorder_level || 0))),
    [products],
  )

  const outstandingRows = useMemo(() => {
    const grouped = new Map<string, { shopId: string; currencies: Record<string, number>; oldestDue: string | null }>()
    invoices.filter((invoice) => !invoice.is_test && !['draft', 'cancelled', 'paid'].includes(invoice.status) && Number(invoice.balance_amount || 0) > 0).forEach((invoice) => {
      const existing: { shopId: string; currencies: Record<string, number>; oldestDue: string | null } = grouped.get(invoice.shop_id) || { shopId: invoice.shop_id, currencies: {}, oldestDue: null }
      existing.currencies[invoice.currency] = (existing.currencies[invoice.currency] || 0) + Number(invoice.balance_amount || 0)
      if (invoice.due_date && (!existing.oldestDue || invoice.due_date < existing.oldestDue)) existing.oldestDue = invoice.due_date
      grouped.set(invoice.shop_id, existing)
    })
    return Array.from(grouped.values())
      .sort((a, b) => Object.values(b.currencies).reduce((sum, value) => sum + value, 0) - Object.values(a.currencies).reduce((sum, value) => sum + value, 0))
      .slice(0, 5)
  }, [invoices])

  const activities = useMemo(() => {
    const rows: Activity[] = []
    income.slice(0, 12).forEach((row) => {
      const payment = row.source_type === 'sales_payment'
      rows.push({
        id: `income-${row.id}`,
        kind: 'income',
        label: payment ? 'Payment received' : 'Income recorded',
        title: payment && row.source_currency && row.source_amount != null ? money(Number(row.source_amount), row.source_currency) : formatLKR(Number(row.amount_lkr || 0)),
        detail: row.store_name || 'Income',
        at: row.created_at,
        view: payment ? 'sales' : 'transactions',
      })
    })
    expenses.slice(0, 12).forEach((row) => {
      rows.push({
        id: `expense-${row.id}`,
        kind: 'expense',
        label: 'Expense submitted',
        title: row.title,
        detail: `${row.category} · ${formatLKR(Number(row.amount_lkr || 0))}`,
        at: row.created_at,
        view: row.status === 'pending' ? 'approvals' : 'transactions',
      })
      if (row.reviewed_at && row.status === 'approved') {
        rows.push({
          id: `approved-${row.id}`,
          kind: 'approval',
          label: 'Expense approved',
          title: row.title,
          detail: formatLKR(Number(row.amount_lkr || 0)),
          at: row.reviewed_at,
          view: 'transactions',
        })
      }
    })
    invoices.slice(0, 12).forEach((invoice) => {
      if (invoice.is_test) return
      const shop = shopMap.get(invoice.shop_id)
      rows.push({
        id: `invoice-${invoice.id}`,
        kind: 'invoice',
        label: 'Invoice created',
        title: invoice.invoice_code,
        detail: shop?.shop_name || money(Number(invoice.total_amount || 0), invoice.currency),
        at: invoice.created_at,
        view: 'sales',
      })
    })
    stockMovements.slice(0, 12).forEach((movement) => {
      const product = productMap.get(movement.product_id)
      rows.push({
        id: `stock-${movement.id}`,
        kind: 'stock',
        label: 'Stock updated',
        title: product?.name || 'Inventory item',
        detail: `${Number(movement.quantity || 0) > 0 ? '+' : ''}${Number(movement.quantity || 0).toLocaleString('en-US')} · balance ${Number(movement.balance_after || 0).toLocaleString('en-US')}`,
        at: movement.created_at,
        view: 'inventory',
      })
    })
    payrolls.filter((row) => row.status === 'paid' && row.paid_at).slice(0, 8).forEach((row) => {
      const employee = profileMap.get(row.employee_id)
      rows.push({
        id: `payroll-${row.id}`,
        kind: 'payroll',
        label: 'Salary paid',
        title: employee?.full_name || employee?.email || 'Employee',
        detail: money(Number(row.net_salary || 0), row.currency),
        at: row.paid_at || '',
        view: 'payroll',
      })
    })
    return rows
      .filter((row) => row.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 6)
  }, [income, expenses, invoices, stockMovements, payrolls, shopMap, productMap, profileMap])

  const cashComparison = comparison(cashThisMonth, cashLastMonth)
  const expenseComparison = comparison(expenseThisMonth, expenseLastMonth, true)
  const profitComparison = comparison(cashProfit, lastCashProfit)
  const activeShopsWithOutstanding = outstandingRows.length
  const salaryDueCount = payrolls.filter((row) => row.status === 'finalized').length
  const statusLoading = loadingData || dashboardLoading

  return (
    <div className="admin-dashboard-v2">
      <section className="admin-dashboard-intro">
        <div className="admin-dashboard-greeting">
          <span className="greeting-mark" aria-hidden="true">✦</span>
          <div>
            <h1>Hello, {displayName}</h1>
            <p>Here’s what’s happening with Aroma Ceylon today.</p>
            {email && <small>{email}</small>}
          </div>
        </div>
        <div className="admin-quick-actions" aria-label="Quick actions">
          <span>Quick Actions</span>
          <div>
            <button className="quick-action invoice" onClick={() => onOpen('sales')}><b>▤</b> New Invoice</button>
            <button className="quick-action income" onClick={() => onOpen('income')}><b>＋</b> Add Income</button>
            <button className="quick-action expense" onClick={() => onOpen('expense')}><b>−</b> Add Expense</button>
            <button className="quick-action approval" onClick={() => onOpen('approvals')}><b>✓</b> Review Approvals{pending.length > 0 ? <em>{pending.length}</em> : null}</button>
          </div>
        </div>
      </section>

      {(dashboardError || statusLoading) && (
        <div className={`admin-dashboard-status ${dashboardError ? 'error' : ''}`}>
          {dashboardError || 'Updating dashboard data…'}
          {!dashboardError && <button onClick={onRefresh}>Refresh now</button>}
        </div>
      )}

      <section className="admin-primary-kpis">
        <article className="admin-kpi cash">
          <div className="admin-kpi-icon">↗</div>
          <div className="admin-kpi-copy"><span>Cash Received</span><strong>{formatLKR(cashThisMonth)}</strong><small>This month</small><em className={cashComparison.direction}>{cashComparison.text}</em></div>
        </article>
        <article className="admin-kpi spend">
          <div className="admin-kpi-icon">↘</div>
          <div className="admin-kpi-copy"><span>Approved Expenses</span><strong>{formatLKR(expenseThisMonth)}</strong><small>This month</small><em className={expenseComparison.direction}>{expenseComparison.text}</em></div>
        </article>
        <article className="admin-kpi profit">
          <div className="admin-kpi-icon">⌁</div>
          <div className="admin-kpi-copy"><span>Cash Profit / Loss</span><strong className={cashProfit < 0 ? 'negative' : ''}>{cashProfit < 0 ? '−' : ''}{formatLKR(Math.abs(cashProfit))}</strong><small>This month</small><em className={profitComparison.direction}>{profitComparison.text}</em></div>
        </article>
        <article className="admin-kpi pending">
          <div className="admin-kpi-icon">◷</div>
          <div className="admin-kpi-copy"><span>Pending Approvals</span><strong>{pending.length}</strong><small>{formatLKR(pending.reduce((sum, row) => sum + Number(row.amount_lkr || 0), 0))} waiting</small><button onClick={() => onOpen('approvals')}>Review now →</button></div>
        </article>
      </section>

      <section className="admin-secondary-kpis">
        <button className="admin-mini-kpi" onClick={() => onOpen('sales')}><span className="mini-icon blue">▤</span><span><small>Net Sales (This Month)</small><CurrencySummary values={monthlySalesByCurrency} /></span></button>
        <button className="admin-mini-kpi" onClick={() => onOpen('sales')}><span className="mini-icon blue">▣</span><span><small>Outstanding from Shops</small><CurrencySummary values={outstandingByCurrency} /><em>{activeShopsWithOutstanding} shop{activeShopsWithOutstanding === 1 ? '' : 's'}</em></span></button>
        <button className="admin-mini-kpi" onClick={() => onOpen('inventory')}><span className="mini-icon green">◇</span><span><small>Inventory Cost Value</small><CurrencySummary values={inventoryValueByCurrency} /><em>{products.filter((row) => row.active).length} active items</em></span></button>
        <button className="admin-mini-kpi alert" onClick={() => onOpen('inventory')}><span className="mini-icon red">!</span><span><small>Low Stock Items</small><strong>{lowStock.length}</strong><em>{lowStock.length > 0 ? 'Requires attention' : 'Stock levels healthy'}</em></span></button>
        <button className="admin-mini-kpi" onClick={() => onOpen('payroll')}><span className="mini-icon neutral">♙</span><span><small>Salary Due</small><CurrencySummary values={salaryDueByCurrency} empty="None due" /><em>{salaryDueCount > 0 ? `${salaryDueCount} finalized payroll${salaryDueCount === 1 ? '' : 's'}` : 'No unpaid payroll'}</em></span></button>
      </section>

      <section className="admin-dashboard-grid">
        <article className="admin-dashboard-card trend-card">
          <header><div><h2>Cash Flow Trend</h2><p>Last 30 days · LKR</p></div><button onClick={() => onOpen('reports')}>Reports ↗</button></header>
          <TrendChart income={income} expenses={expenses} />
        </article>

        <article className="admin-dashboard-card outstanding-card">
          <header><div><h2>Outstanding by Shop</h2><p>Open customer balances</p></div><button onClick={() => onOpen('reports')}>View all</button></header>
          <div className="admin-list">
            {outstandingRows.length === 0 ? <div className="admin-list-empty">No outstanding shop balances.</div> : outstandingRows.map((row) => {
              const shop = shopMap.get(row.shopId)
              const overdueDays = row.oldestDue ? Math.max(0, Math.floor((Date.now() - new Date(`${row.oldestDue}T12:00:00`).getTime()) / 86_400_000)) : 0
              return (
                <button key={row.shopId} onClick={() => onOpen('sales')} className="admin-list-row">
                  <span className="list-main"><strong>{shop?.shop_name || 'Shop'}</strong><small>{shop?.city || 'Customer account'}</small></span>
                  <span className="list-money">{Object.entries(row.currencies).map(([currency, value]) => <strong key={currency}>{money(Number(value), currency)}</strong>)}</span>
                  <em className={overdueDays > 30 ? 'late' : overdueDays > 0 ? 'due' : 'ok'}>{overdueDays > 0 ? `${overdueDays} days` : 'Current'}</em>
                </button>
              )
            })}
          </div>
        </article>

        <article className="admin-dashboard-card stock-card">
          <header><div><h2>Inventory Alerts</h2><p>Low-stock products</p></div><button onClick={() => onOpen('inventory')}>View all</button></header>
          <div className="admin-list stock-list">
            {lowStock.length === 0 ? <div className="admin-list-empty success">No low-stock alerts. Everything looks healthy.</div> : lowStock.slice(0, 5).map((product) => (
              <button key={product.id} onClick={() => onOpen('inventory')} className="admin-list-row stock-row">
                <span className="stock-product-icon">A</span>
                <span className="list-main"><strong>{product.name}</strong><small>SKU: {product.sku}{product.pack_size ? ` · ${product.pack_size}` : ''}</small></span>
                <span className="stock-balance"><strong>{Number(product.stock_quantity || 0).toLocaleString('en-US')}</strong><small>left · reorder {Number(product.reorder_level || 0).toLocaleString('en-US')}</small></span>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="admin-dashboard-card recent-card">
        <header><div><h2>Recent Activity</h2><p>Latest business events across the system</p></div><button onClick={() => onOpen('transactions')}>Transactions</button></header>
        <div className="recent-activity-grid">
          {activities.length === 0 ? <div className="admin-list-empty">No recent activity yet.</div> : activities.map((activity) => (
            <button key={activity.id} className="recent-activity-item" onClick={() => onOpen(activity.view)}>
              <span className={`activity-icon ${activity.kind}`}>{activity.kind === 'invoice' ? '▤' : activity.kind === 'income' ? '↗' : activity.kind === 'expense' ? '↘' : activity.kind === 'approval' ? '✓' : activity.kind === 'stock' ? '◇' : '$'}</span>
              <span><small>{activity.label}</small><strong>{activity.title}</strong><em>{activity.detail}</em><time>{dateTime(activity.at)}</time></span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
