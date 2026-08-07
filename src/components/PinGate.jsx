import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isBiometricAvailable, authenticateWithBiometrics } from '../lib/biometric'
import { useSecurity } from '../lib/SecurityContext'

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Shared app PIN — one PIN (stored as profiles.user_tab_pin) protects every section
// wrapped in this gate. Set it once from any protected section; it unlocks the others
// with the same PIN. Unlock state is shared for the whole app session (see
// SecurityContext) — entering once unlocks every gated section until you close
// the app, rather than re-prompting on every visit. Fingerprint/face unlock is
// offered as a same-device alternative to typing the PIN, not a separate credential.
export default function PinGate({ uid, label, code, children }) {
  const [hasPin, setHasPin] = useState(null) // null = loading
  const { unlocked, setUnlocked } = useSecurity()
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [err, setErr] = useState('')
  const [bio, setBio] = useState({ available: false, reason: null })

  useEffect(() => {
    supabase.from('profiles').select('user_tab_pin').eq('id', uid).single().then(({ data }) => {
      setHasPin(!!data?.user_tab_pin)
    })
    isBiometricAvailable().then(setBio)
  }, [uid])

  const create = async () => {
    setErr('')
    if (!/^\d{4,8}$/.test(pin)) { setErr('PIN must be 4–8 digits.'); return }
    if (pin !== confirmPin) { setErr('PINs do not match.'); return }
    const hash = await sha256Hex(pin)
    const { error } = await supabase.from('profiles').update({ user_tab_pin: hash }).eq('id', uid)
    if (error) { setErr(error.message); return }
    setHasPin(true); setUnlocked(true)
  }

  const unlock = async () => {
    setErr('')
    const { data } = await supabase.from('profiles').select('user_tab_pin').eq('id', uid).single()
    const hash = await sha256Hex(pin)
    if (hash === data?.user_tab_pin) setUnlocked(true)
    else setErr('Incorrect PIN.')
  }

  const unlockWithBiometrics = async () => {
    setErr('')
    const ok = await authenticateWithBiometrics(`Unlock ${label}`)
    if (ok) setUnlocked(true)
    else setErr('Biometric authentication failed or was cancelled — use your PIN instead.')
  }

  if (hasPin === null) return null
  if (unlocked) return children

  return (
    <>
      <div className="section-head">
        <h2 className="display">{label}</h2>
        <span className="hud">{code} · LOCKED</span>
      </div>
      <div className="panel" style={{ maxWidth: 340, margin: '0 auto', textAlign: 'center' }}>
        <div className="hud" style={{ marginBottom: '0.8rem' }}>
          {hasPin ? 'ENTER PIN TO CONTINUE' : 'SET A PIN TO PROTECT THIS SECTION'}
        </div>
        {!hasPin && (
          <div className="item-sub" style={{ marginBottom: '0.7rem' }}>
            This PIN also protects any other locked section in the app.
          </div>
        )}
        {err && <div className="auth-err">{err}</div>}
        {hasPin && bio.available && (
          <button className="btn-sm" style={{ width: '100%', marginBottom: '0.9rem' }} onClick={unlockWithBiometrics}>
            🔒 Unlock with fingerprint / face
          </button>
        )}
        {hasPin && !bio.available && bio.reason && (
          <div className="item-sub" style={{ marginBottom: '0.9rem', opacity: 0.6 }}>
            Fingerprint unavailable: {bio.reason}
          </div>
        )}
        <input className="input" type="password" inputMode="numeric" placeholder="PIN" value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          onKeyDown={e => e.key === 'Enter' && (hasPin ? unlock() : !confirmPin && document.getElementById('confirm-pin-input')?.focus())}
          style={{ marginBottom: '0.7rem', textAlign: 'center', letterSpacing: '0.3em' }} />
        {!hasPin && (
          <input id="confirm-pin-input" className="input" type="password" inputMode="numeric" placeholder="Confirm PIN" value={confirmPin}
            onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            onKeyDown={e => e.key === 'Enter' && create()}
            style={{ marginBottom: '0.9rem', textAlign: 'center', letterSpacing: '0.3em' }} />
        )}
        <button className="btn-sm" onClick={hasPin ? unlock : create} style={{ width: '100%' }}>
          {hasPin ? 'Unlock' : 'Set PIN'}
        </button>
      </div>
    </>
  )
}
