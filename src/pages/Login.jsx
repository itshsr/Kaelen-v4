import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')

  const submit = async () => {
    setErr(''); setInfo(''); setBusy(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email, password, options: { data: { name } },
        })
        if (error) throw error
        setInfo('Account created. Check your email if confirmation is required, then sign in.')
        setMode('login')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="corner tl hud">KAELEN / OS</div>
      <div className="corner tr hud">01 — GATE · IDLE</div>
      <div className="corner bl hud">SYS.LINK READY</div>
      <div className="corner br hud">v1 · PHASE 1</div>

      <div className="login-card">
        <img src="/wolf-icon.png" alt="" style={{ height: 96, width: "auto", borderRadius: 12, display: "block", margin: "0 auto 0.7rem", boxShadow: "0 0 24px var(--glow)" }} />
        <h1>KAELEN</h1>
        <p className="login-sub hud">personal operating system</p>

        {err && <div className="auth-err">{err}</div>}
        {info && <div className="auth-err" style={{ color: 'var(--warm)' }}>{info}</div>}

        {mode === 'signup' && (
          <div className="field">
            <label className="hud">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
          </div>
        )}
        <div className="field">
          <label className="hud">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div className="field">
          <label className="hud">Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>

        <button className="btn" onClick={submit} disabled={busy || !email || !password}>
          {busy ? '···' : mode === 'signup' ? 'Create account' : 'Enter'}
        </button>

        <div className="auth-toggle">
          {mode === 'login' ? (
            <>No account? <button onClick={() => { setMode('signup'); setErr('') }}>Sign up</button></>
          ) : (
            <>Have an account? <button onClick={() => { setMode('login'); setErr('') }}>Sign in</button></>
          )}
        </div>
      </div>
    </div>
  )
}
