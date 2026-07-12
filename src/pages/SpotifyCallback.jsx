import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { handleSpotifyCallback } from '../lib/spotify'

export default function SpotifyCallback() {
  const [params] = useSearchParams()
  const [err, setErr] = useState('')
  const nav = useNavigate()

  useEffect(() => {
    const code = params.get('code')
    const state = params.get('state')
    const error = params.get('error')
    if (error) { setErr(error); return }
    if (!code) { setErr('No authorization code received.'); return }
    handleSpotifyCallback(code, state)
      .then(() => nav('/', { replace: true }))
      .catch(e => setErr(e.message))
  }, []) // eslint-disable-line

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ textAlign: 'center' }}>
        {err ? (
          <>
            <div className="auth-err">{err}</div>
            <a href="/" className="btn-ghost" style={{ textDecoration: 'none', display: 'inline-block' }}>Back to KAELEN</a>
          </>
        ) : (
          <span className="hud">CONNECTING SPOTIFY…</span>
        )}
      </div>
    </div>
  )
}
