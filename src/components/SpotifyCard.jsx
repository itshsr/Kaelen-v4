import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  getSpotifyToken, startSpotifyAuth, disconnectSpotify,
  spotifyNowPlaying, spotifyPlay, spotifyPause, spotifyNext, spotifyPrevious,
} from '../lib/spotify'

export default function SpotifyCard() {
  const [connected, setConnected] = useState(null) // null = checking
  const [track, setTrack] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const pollRef = useRef(null)

  const checkConnection = async () => {
    const token = await getSpotifyToken()
    setConnected(!!token)
    if (token) poll()
  }

  const poll = async () => {
    try {
      const data = await spotifyNowPlaying()
      if (data?.item) {
        setTrack({
          name: data.item.name,
          artist: data.item.artists?.map(a => a.name).join(', '),
          art: data.item.album?.images?.[2]?.url || data.item.album?.images?.[0]?.url,
        })
        setIsPlaying(!!data.is_playing)
      } else {
        setTrack(null)
      }
      setErr('')
    } catch (e) {
      if (e.message === 'NOT_CONNECTED') setConnected(false)
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) checkConnection() })
    pollRef.current = setInterval(() => { if (connected) poll() }, 8000)
    return () => clearInterval(pollRef.current)
  }, []) // eslint-disable-line

  const act = async fn => {
    setBusy(true); setErr('')
    try { await fn(); setTimeout(poll, 400) }
    catch (e) { setErr(e.message === 'NOT_CONNECTED' ? 'Spotify not connected.' : e.message) }
    finally { setBusy(false) }
  }

  if (connected === null) return null

  if (!connected) {
    return (
      <div className="panel">
        <div className="row between" style={{ marginBottom: '0.5rem' }}>
          <span className="hud">SPOTIFY</span>
          <span className="pill">NOT CONNECTED</span>
        </div>
        <button className="btn-sm" onClick={startSpotifyAuth}>Connect Spotify</button>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: '0.7rem' }}>
        <span className="hud">SPOTIFY</span>
        <button className="btn-ghost" onClick={() => act(async () => { await disconnectSpotify(); setConnected(false); setTrack(null) })}>
          Disconnect
        </button>
      </div>
      {err && <div className="auth-err">{err}</div>}
      {track ? (
        <div className="row" style={{ gap: '0.8rem', alignItems: 'center' }}>
          {track.art && <img src={track.art} alt="" style={{ width: 52, height: 52, borderRadius: 8 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="item-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.name}</div>
            <div className="item-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.artist}</div>
          </div>
        </div>
      ) : (
        <div className="empty">Nothing playing. Start playback on any device.</div>
      )}
      <div className="row" style={{ justifyContent: 'center', gap: '0.8rem', marginTop: '0.9rem' }}>
        <button className="btn-ghost" disabled={busy} onClick={() => act(spotifyPrevious)}>⏮</button>
        <button className="btn-sm" disabled={busy} onClick={() => act(isPlaying ? spotifyPause : spotifyPlay)}>
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        <button className="btn-ghost" disabled={busy} onClick={() => act(spotifyNext)}>⏭</button>
      </div>
    </div>
  )
}
