import { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { AppearanceProvider, useAppearance } from './lib/AppearanceContext'
import { SecurityProvider } from './lib/SecurityContext'
import { ConfirmProvider } from './lib/ConfirmContext'
import Login from './pages/Login'
import Home from './pages/Home'
import GalaxyBackground from './components/GalaxyBackground'
import { useCalendarData, dayItems, today as todayIso, resyncEventNotifications } from './lib/calendarData'
import { THEMES } from './lib/themes'

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

function useIsCoreRoute() {
  return useLocation().pathname === '/core'
}

const SECTIONS = [
  { path: '/', label: 'HOME' },
  { path: '/core', label: 'CORE' },
  { path: '/calendar', label: 'CALENDAR' },
  { path: '/forge', label: 'FORGE' },
  { path: '/oracle', label: 'ORACLE' },
  { path: '/grimoire', label: 'GRIMOIRE' },
  { path: '/vault', label: 'VAULT' },
  { path: '/user', label: 'USER' },
]

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profileName, setProfileName] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    supabase.from('profiles').select('name').eq('id', session.user.id).single()
      .then(({ data }) => { if (data?.name) setProfileName(data.name) })
    resyncEventNotifications(session.user.id)
  }, [session])

  if (session === undefined) return null

  return (
    <AppearanceProvider session={session}>
      <SecurityProvider>
        <ConfirmProvider>
          <AppInner session={session} profileName={profileName} />
        </ConfirmProvider>
      </SecurityProvider>
    </AppearanceProvider>
  )
}

const BG_DENSITY = { starfield: 1, calm: 0.28, off: 0, custom: 0 }

function CustomBackground({ path }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let cancelled = false
    if (!path) { setUrl(null); return }
    supabase.storage.from('backgrounds').createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl || null)
    })
    return () => { cancelled = true }
  }, [path])
  if (!url) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
      backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center',
    }} />
  )
}

function AppInner({ session, profileName }) {
  const { theme, setTheme, appearance } = useAppearance()
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const bgDensity = BG_DENSITY[appearance.backgroundArt] ?? 1

  if (!session) return (
    <>
      <GalaxyBackground theme={theme} density={bgDensity} />
      <Login />
    </>
  )

  const pickTheme = async next => {
    await setTheme(next)
    setShowThemeMenu(false)
  }

  return (
    <BrowserRouter>
      <OfflineBanner />
      <ReminderBanner uid={session?.user?.id} />
      {appearance.backgroundArt === 'custom' && appearance.customBackgroundPath
        ? <CustomBackground path={appearance.customBackgroundPath} />
        : <GalaxyBackground theme={theme} density={bgDensity} />}
      <Shell
        theme={theme} showThemeMenu={showThemeMenu} setShowThemeMenu={setShowThemeMenu}
        pickTheme={pickTheme} profileName={profileName}
        customBgActive={appearance.backgroundArt === 'custom' && !!appearance.customBackgroundPath}
      />
    </BrowserRouter>
  )
}

function Shell({ theme, showThemeMenu, setShowThemeMenu, pickTheme, profileName, customBgActive }) {
  const isCore = useIsCoreRoute() // only CORE locks the shell to viewport height for its own internal scroll
  return (
    <div className={`shell${isCore ? ' shell-locked' : ''}${customBgActive ? ' custom-bg' : ''}`}>
      <header className="topbar">
        <span className="brand-lockup"><img src="/wolf-icon.png" alt="" style={{ height: 30, width: "auto", borderRadius: 6 }} /><span className="brand">KAELEN</span></span>
        <div className="top-actions">
          <div style={{ position: 'relative' }}>
            <button className="icon-btn" onClick={() => setShowThemeMenu(v => !v)} aria-label="Change theme">THEME</button>
            {showThemeMenu && (
              <div style={{
                position: 'absolute', top: '110%', right: 0, zIndex: 50,
                background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 12,
                padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 140,
              }}>
                {THEMES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => pickTheme(t.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '0.4rem 0.5rem', borderRadius: 8, color: 'var(--text)',
                      font: 'inherit', textAlign: 'left',
                      outline: theme === t.id ? '1px solid var(--accent)' : 'none',
                    }}
                  >
                    <span style={{ width: 16, height: 16, borderRadius: '50%', background: t.swatch, flexShrink: 0 }} />
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
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
  )
}
