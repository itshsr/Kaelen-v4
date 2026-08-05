import { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Home from './pages/Home'
import GalaxyBackground from './components/GalaxyBackground'
import { useCalendarData, dayItems, today as todayIso } from './lib/calendarData'

// Route-level code splitting — each page's JS only downloads when actually
// visited, instead of every page loading on first paint regardless of use.
const Forge = lazy(() => import('./pages/Forge'))
const Vault = lazy(() => import('./pages/Vault'))
const Grimoire = lazy(() => import('./pages/Grimoire'))
const User = lazy(() => import('./pages/User'))
const SpotifyCallback = lazy(() => import('./pages/SpotifyCallback'))
const Core = lazy(() => import('./pages/Core'))
const Oracle = lazy(() => import('./pages/Oracle'))
const Calendar = lazy(() => import('./pages/Calendar'))

function RouteFallback() {
  return <div className="panel placeholder"><span className="hud">LOADING…</span></div>
}

function ReminderBanner({ uid }) {
  const data = useCalendarData(uid)
  const [dismissed, setDismissed] = useState(() => new Set())
  const [now, setNow] = useState(() => Date.now())

  // In-app only — no native notification, so this only fires while KAELEN is
  // open. A 60s poll is cheap (a few small Supabase reads), not the kind of
  // background AI call the app avoids; nothing here touches Gemini.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])

  if (!uid) return null
  const nowDate = new Date(now)
  const items = dayItems(todayIso(), data).filter(i => !i.allDay && i.time)
  const upcoming = items.filter(i => {
    const [h, m] = i.time.split(':').map(Number)
    const eventMs = new Date(nowDate).setHours(h, m, 0, 0)
    const minsAway = (eventMs - now) / 60000
    return minsAway >= 0 && minsAway <= 30 && !dismissed.has(i.id)
  })
  if (upcoming.length === 0) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 490,
      background: 'linear-gradient(90deg, #2a2f7c, #4a3b8c)', color: '#f4f0ff',
      padding: '0.6rem 1rem', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem',
    }}>
      {upcoming.map(i => (
        <div key={i.id} className="row between">
          <span>⏰ {i.title} — {i.time.slice(0, 5)}</span>
          <button className="btn-ghost" style={{ padding: '0 0.4rem', color: '#f4f0ff' }} onClick={() => setDismissed(s => new Set([...s, i.id]))}>✕</button>
        </div>
      ))}
    </div>
  )
}

function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (online) return null
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500,
      background: '#5f1c28', color: '#f4ecd9', textAlign: 'center',
      padding: '0.4rem 1rem', fontSize: '0.8rem', letterSpacing: '0.05em',
    }}>
      No connection — reconnect to keep KAELEN in sync
    </div>
  )
}

const SECTIONS = [
  { path: '/', label: 'HOME' },
  { path: '/core', label: 'CORE' },
  { path: '/forge', label: 'FORGE' },
  { path: '/oracle', label: 'ORACLE' },
  { path: '/grimoire', label: 'GRIMOIRE' },
  { path: '/vault', label: 'VAULT' },
  { path: '/calendar', label: 'CALENDAR' },
  { path: '/user', label: 'USER' },
]

function Placeholder({ label, tag, note }) {
  return (
    <>
      <div className="section-head">
        <h2 className="display">{label}</h2>
        <span className="hud">{tag}</span>
      </div>
      <div className="panel placeholder">
        <span className="hud">{tag} · STANDBY</span>
        <span className="big">{note}</span>
      </div>
    </>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profileName, setProfileName] = useState('')
  const [theme, setTheme] = useState(() => localStorage.getItem('kaelen-theme') || 'dark')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('kaelen-theme', theme)
  }, [theme])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    supabase.from('profiles').select('name, theme').eq('id', session.user.id).single()
      .then(({ data }) => {
        if (data?.name) setProfileName(data.name)
        if (data?.theme && data.theme !== theme) setTheme(data.theme)
      })
  }, [session]) // eslint-disable-line

  const toggleTheme = async () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    if (session) await supabase.from('profiles').update({ theme: next }).eq('id', session.user.id)
  }

  if (session === undefined) return null
  if (!session) return (
    <>
      <GalaxyBackground theme={theme} />
      <Login />
    </>
  )

  return (
    <BrowserRouter>
      <OfflineBanner />
      <ReminderBanner uid={session?.user?.id} />
      <GalaxyBackground theme={theme} />
      <div className="shell">
        <header className="topbar">
          <span className="brand-lockup"><img src="/wolf-icon.png" alt="" style={{ height: 30, width: "auto", borderRadius: 6 }} /><span className="brand">KAELEN</span></span>
          <div className="top-actions">
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'dark' ? 'LIGHT' : 'DARK'}
            </button>
            <button className="icon-btn" onClick={() => supabase.auth.signOut()}>EXIT</button>
          </div>
        </header>

        <main className="main">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Home profileName={profileName} />} />
              <Route path="/core" element={<Core profileName={profileName} />} />
              <Route path="/forge" element={<Forge />} />
              <Route path="/oracle" element={<Oracle />} />
              <Route path="/grimoire" element={<Grimoire />} />
              <Route path="/vault" element={<Vault />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/user" element={<User />} />
              <Route path="/spotify-callback" element={<SpotifyCallback />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>

        <nav className="nav">
          {SECTIONS.map(s => (
            <NavLink key={s.path} to={s.path} end={s.path === '/'}
              className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="dot" />
              {s.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </BrowserRouter>
  )
}
