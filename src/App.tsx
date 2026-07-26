import { FormEvent, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type Role = 'admin' | 'user'

type Profile = {
  id: string
  full_name: string
  email: string | null
  role: Role
  active: boolean
  job_title: string | null
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

function ModuleCard({
  title,
  text,
  badge,
}: {
  title: string
  text: string
  badge?: string
}) {
  return (
    <article className="module-card">
      <div className="module-heading">
        <h3>{title}</h3>
        {badge && <span className="badge">{badge}</span>}
      </div>
      <p>{text}</p>
      <button type="button" className="text-button" disabled>
        Coming next
      </button>
    </article>
  )
}

function Dashboard({ profile }: { profile: Profile }) {
  const isAdmin = profile.role === 'admin'

  async function logout() {
    await supabase.auth.signOut()
  }

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

      <main className="dashboard">
        <section className="welcome-panel">
          <p className="eyebrow">{isAdmin ? 'ADMIN CONTROL CENTRE' : 'MY WORKSPACE'}</p>
          <h1>Hello, {profile.full_name || profile.email || 'Team Member'}</h1>
          <p>
            {isAdmin
              ? 'Your secure V2 workspace is connected to Supabase. We will now build each business module.'
              : 'Submit expenses, view attendance and access finalized payslips from this workspace.'}
          </p>
        </section>

        <section className="status-grid">
          <article>
            <span>Account</span>
            <strong>{profile.active ? 'Active' : 'Inactive'}</strong>
          </article>
          <article>
            <span>Role</span>
            <strong>{isAdmin ? 'Admin' : 'User'}</strong>
          </article>
          <article>
            <span>Cloud</span>
            <strong>Connected</strong>
          </article>
        </section>

        <section className="section-title">
          <p className="eyebrow">V2 MODULES</p>
          <h2>{isAdmin ? 'Business overview' : 'Your tools'}</h2>
        </section>

        <section className="module-grid">
          {isAdmin ? (
            <>
              <ModuleCard title="Income & Profit" text="EUR income, LKR conversion and profit/loss reporting." />
              <ModuleCard title="Expense Approvals" text="Review pending bills and approve or reject employee expenses." badge="Admin" />
              <ModuleCard title="Employees" text="Manage profiles, roles, active status and access." />
              <ModuleCard title="Attendance" text="Mark present, absent, half day or leave for every employee." />
              <ModuleCard title="Payroll" text="Update monthly salary, finalize payroll and generate PDF payslips." />
              <ModuleCard title="Reports" text="Monthly, store and employee reports with PDF and Excel export." />
            </>
          ) : (
            <>
              <ModuleCard title="Submit Expense" text="Add an expense, note and compressed bill photograph." />
              <ModuleCard title="My Submissions" text="Track pending, approved and rejected expenses." />
              <ModuleCard title="My Attendance" text="View your attendance calendar and monthly totals." />
              <ModuleCard title="My Payslips" text="View and download finalized monthly PDF payslips." />
            </>
          )}
        </section>
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
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

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
