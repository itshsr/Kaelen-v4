import { supabase } from './supabase'

// Spotify Web API — Authorization Code + PKCE flow (public client, no secret required).
// Requires Spotify Premium for playback control endpoints.
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '1b9f5a805228469b8a800eb19b5bc2ee'
// Hardcoded to the stable production domain — Vercel preview URLs (per-deploy hashes)
// will never match what's registered in the Spotify dashboard, so this must NOT be
// derived from window.location.origin. Always access KAELEN via this domain for
// Spotify login to work.
const REDIRECT_URI = 'https://kaelen-v4.vercel.app/spotify-callback'
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state'

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function sha256(input) {
  const data = new TextEncoder().encode(input)
  return await crypto.subtle.digest('SHA-256', data)
}

function randomString(len = 64) {
  const arr = new Uint8Array(len)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => ('0' + b.toString(16)).slice(-2)).join('').slice(0, len)
}

export async function startSpotifyAuth() {
  const verifier = randomString(64)
  localStorage.setItem('spotify_verifier', verifier)
  const challenge = b64url(await sha256(verifier))

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    // Verifier is also round-tripped via `state` — some mobile browsers/OS
    // hand the login off to the Spotify app itself, which can return to a
    // browser context that doesn't share localStorage with the tab that
    // started the flow. `state` survives that regardless.
    state: verifier,
  })
  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

export async function handleSpotifyCallback(code, state) {
  const verifier = state || localStorage.getItem('spotify_verifier')
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { detail = (await res.json())?.error_description || detail } catch { /* keep status */ }
    if (detail.includes('HTTP') && !verifier) detail = 'No PKCE verifier found — the login may have taken too long, or storage was cleared. Try connecting again.'
    throw new Error(`Spotify authorization failed: ${detail}`)
  }
  const data = await res.json()

  await supabase.rpc('set_spotify_tokens', {
    p_access: data.access_token,
    p_refresh: data.refresh_token,
    p_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  })

  localStorage.removeItem('spotify_verifier')
  return data.access_token
}

async function refreshToken(refresh_token) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
      client_id: CLIENT_ID,
    }),
  })
  if (!res.ok) throw new Error('Spotify token refresh failed')
  const data = await res.json()
  await supabase.rpc('set_spotify_tokens', {
    p_access: data.access_token,
    p_refresh: data.refresh_token || null,
    p_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  })
  return data.access_token
}

export async function getSpotifyToken() {
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) return null
  const { data: rows } = await supabase.rpc('get_spotify_tokens')
  const p = rows?.[0]
  if (!p?.access_token) return null
  const expiresAt = p.expires_at ? new Date(p.expires_at).getTime() : 0
  if (Date.now() > expiresAt - 30000) {
    if (!p.refresh_token) return null
    return await refreshToken(p.refresh_token)
  }
  return p.access_token
}

export async function disconnectSpotify() {
  await supabase.rpc('clear_spotify_tokens')
}

async function api(path, options = {}) {
  const token = await getSpotifyToken()
  if (!token) throw new Error('NOT_CONNECTED')
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  })
  if (res.status === 204 || res.status === 202) return null
  if (res.status === 404) return null // no active device

  const text = await res.text()
  let parsed = null
  if (text) {
    try { parsed = JSON.parse(text) } catch { /* body wasn't JSON — handled below */ }
  }

  if (!res.ok) {
    const msg = parsed?.error?.message || (text ? text.slice(0, 200) : `Spotify error ${res.status}`)
    throw new Error(msg)
  }
  return parsed
}

export const spotifyNowPlaying = () => api('/me/player/currently-playing')
export const spotifyPlay = () => api('/me/player/play', { method: 'PUT' })
export const spotifyPause = () => api('/me/player/pause', { method: 'PUT' })
export const spotifyNext = () => api('/me/player/next', { method: 'POST' })
export const spotifyPrevious = () => api('/me/player/previous', { method: 'POST' })
