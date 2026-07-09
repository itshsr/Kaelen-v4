import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Home from './pages/Home'
import Forge from './pages/Forge'
import Vault from './pages/Vault'
import Grimoire from './pages/Grimoire'
import User from './pages/User'
import SpotifyCallback from './pages/SpotifyCallback'
import Core from './pages/Core'
import Oracle from './pages/Oracle'
import GalaxyBackground from './components/GalaxyBackground'

const SECTIONS = [
  { path: '/', label: 'HOME' },
  { path: '/core', label: 'CORE' },
  { path: '/forge', label: 'FORGE' },
  { path: '/oracle', label: 'ORACLE' },
  { path: '/grimoire', label: 'GRIMOIRE' },
  { path: '/vault', label: 'VAULT' },
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
      <GalaxyBackground theme={theme} />
      <div className="shell">
        <header className="topbar">
          <span className="brand-lockup"><img src="/wolf.png" alt="" style={{ height: 30, width: "auto", borderRadius: 6 }} /><span className="brand">KAELEN</span></span>
          <div className="top-actions">
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'dark' ? 'LIGHT' : 'DARK'}
            </button>
            <button className="icon-btn" onClick={() => supabase.auth.signOut()}>EXIT</button>
          </div>
        </header>

        <main className="main">
          <Routes>
            <Route path="/" element={<Home profileName={profileName} />} />
            <Route path="/core" element={<Core profileName={profileName} />} />
            <Route path="/forge" element={<Forge />} />
            <Route path="/oracle" element={<Oracle />} />
            <Route path="/grimoire" element={<Grimoire />} />
            <Route path="/vault" element={<Vault />} />
            <Route path="/user" element={<User />} />
            <Route path="/spotify-callback" element={<SpotifyCallback />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
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
