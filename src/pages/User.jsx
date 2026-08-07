import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PinGate from '../components/PinGate'
import { useAppearance } from '../lib/AppearanceContext'
import { THEMES } from '../lib/themes'
import { SCALE_STEPS } from '../lib/appearance'

function UserContent({ uid }) {
  const [tab, setTab] = useState('profile')
  return (
    <>
      <div className="section-head">
        <h2 className="display">USER</h2>
        <span className="hud">07 — SELF · LIVE</span>
      </div>
      <div className="tabs">
        {['profile', 'people', 'ai key', 'appearance'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t.toUpperCase()}</button>
        ))}
      </div>
      {uid && tab === 'profile' && <Profile uid={uid} />}
      {uid && tab === 'people' && <People uid={uid} />}
      {uid && tab === 'ai key' && <ApiKey uid={uid} />}
      {uid && tab === 'appearance' && <Appearance />}
    </>
  )
}

export default function User() {
  const [uid, setUid] = useState(null)
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data.user?.id)) }, [])
  if (!uid) return null
  return (
    <PinGate uid={uid} label="USER" code="07 — SELF">
      <UserContent uid={uid} />
    </PinGate>
  )
}

function Profile({ uid }) {
  const [p, setP] = useState(null)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', uid).single().then(({ data }) => setP(data))
  }, [uid])

  const set = (k, v) => setP(prev => ({ ...prev, [k]: v }))
  const save = async () => {
    setErr('')
    const { error } = await supabase.from('profiles').update({
      name: p.name, role: p.role, city: p.city,
      birth_date: p.birth_date || null, birth_time: p.birth_time || null, birth_place: p.birth_place,
    }).eq('id', uid)
    if (error) { setErr(error.message); return }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (!p) return null
  return (
    <div className="panel grid">
      <div className="grid cols2">
        <div className="field"><label className="hud">Name</label>
          <input className="input" value={p.name || ''} onChange={e => set('name', e.target.value)} /></div>
        <div className="field"><label className="hud">Role</label>
          <input className="input" value={p.role || ''} onChange={e => set('role', e.target.value)} /></div>
        <div className="field"><label className="hud">City</label>
          <input className="input" value={p.city || ''} onChange={e => set('city', e.target.value)} /></div>
        <div className="field"><label className="hud">Birth place</label>
          <input className="input" value={p.birth_place || ''} onChange={e => set('birth_place', e.target.value)} /></div>
        <div className="field"><label className="hud">Birth date</label>
          <input className="input" type="date" value={p.birth_date || ''} onChange={e => set('birth_date', e.target.value)} /></div>
        <div className="field"><label className="hud">Birth time</label>
          <input className="input" type="time" value={p.birth_time || ''} onChange={e => set('birth_time', e.target.value)} /></div>
      </div>
      <div className="row">
        <button className="btn-sm" onClick={save}>Save profile</button>
        {saved && <span className="pill accent">SAVED</span>}
      </div>
      {err && <div className="auth-err">{err}</div>}
      <span className="hud">Birth details feed ORACLE readings in Phase 4.</span>
    </div>
  )
}

function People({ uid }) {
  const [people, setPeople] = useState([])
  const [form, setForm] = useState({ name: '', relationship: '', birth_date: '', birth_time: '', birth_place: '', emoji: '', city: '', notes: '' })
  const [err, setErr] = useState('')

  const load = async () => {
    const { data } = await supabase.from('people_profiles').select('*').order('created_at')
    setPeople(data || [])
  }
  useEffect(() => { if (uid) load() }, [uid])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const add = async () => {
    if (!form.name.trim()) return
    setErr('')
    const { error } = await supabase.from('people_profiles').insert({
      user_id: uid, ...form,
      birth_date: form.birth_date || null, birth_time: form.birth_time || null,
    })
    if (error) { setErr(error.message); return }
    setForm({ name: '', relationship: '', birth_date: '', birth_time: '', birth_place: '', emoji: '', city: '', notes: '' })
    load()
  }
  const del = async id => {
    if (!window.confirm('Delete this person? This cannot be undone.')) return
    setErr('')
    const { error } = await supabase.from('people_profiles').delete().eq('id', id)
    if (error) { setErr(error.message); return }
    load()
  }

  return (
    <div className="grid">
      <div className="panel grid">
        <div className="grid cols2">
          <input className="input" placeholder="Name *" value={form.name} onChange={e => set('name', e.target.value)} />
          <input className="input" placeholder="Relationship" value={form.relationship} onChange={e => set('relationship', e.target.value)} />
          <input className="input" placeholder="Emoji" value={form.emoji} onChange={e => set('emoji', e.target.value)} />
          <input className="input" placeholder="City" value={form.city} onChange={e => set('city', e.target.value)} />
          <div className="field"><label className="hud">Birth date</label>
            <input className="input" type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} /></div>
          <div className="field"><label className="hud">Birth time</label>
            <input className="input" type="time" value={form.birth_time} onChange={e => set('birth_time', e.target.value)} /></div>
          <input className="input" placeholder="Birth place" value={form.birth_place} onChange={e => set('birth_place', e.target.value)} />
          <input className="input" placeholder="Notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <button className="btn-sm" onClick={add}>Add person</button>
      </div>
      {err && <div className="auth-err">{err}</div>}
      <div className="list">
        {people.length === 0 && <div className="empty">No people profiles yet.</div>}
        {people.map(pp => (
          <div className="item" key={pp.id}>
            <div style={{ flex: 1 }}>
              <div className="item-title" style={{ fontWeight: 600 }}>{pp.emoji ? pp.emoji + ' ' : ''}{pp.name}</div>
              <div className="item-sub">
                {[pp.relationship, pp.birth_date, pp.birth_place].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <button className="btn-ghost danger" onClick={() => del(pp.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ApiKey({ uid }) {
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [active, setActive] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.rpc('get_gemini_key').then(({ data }) => {
      if (data) { setKey(data); setActive(true) }
    })
  }, [uid])

  const save = async () => {
    setErr('')
    const { error } = await supabase.rpc('set_gemini_key', { p_key: key.trim() || null })
    if (error) { setErr(error.message); return }
    setActive(!!key.trim()); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="panel grid">
      <div className="row between">
        <span className="hud">GEMINI API KEY</span>
        <span className={`pill ${active ? 'accent' : ''}`}>{active ? 'KEY STORED · AI DORMANT' : 'NO KEY · AI DORMANT'}</span>
      </div>
      <div className="mask-row">
        <input className="input" type={show ? 'text' : 'password'} placeholder="Paste free-tier Gemini API key"
          value={key} onChange={e => setKey(e.target.value)} autoComplete="off" />
        <button className="btn-ghost" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
      </div>
      <div className="row">
        <button className="btn-sm" onClick={save}>Save key</button>
        {saved && <span className="pill accent">SAVED</span>}
      </div>
      {err && <div className="auth-err">{err}</div>}
      <span className="hud">AI layer activates in Phase 3. No calls are made until then.</span>
    </div>
  )
}

function Appearance() {
  const { theme, setTheme, appearance, setAppearance } = useAppearance()
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')

  const uploadBackground = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadErr(''); setUploading(true)
    try {
      const { data: u } = await supabase.auth.getUser()
      const uid = u.user?.id
      const ext = file.name.split('.').pop()
      const path = `${uid}/bg.${ext}`
      // Overwrite any previous custom background — one per account, not a gallery.
      const { error } = await supabase.storage.from('backgrounds').upload(path, file, { upsert: true })
      if (error) throw error
      await setAppearance({ backgroundArt: 'custom', customBackgroundPath: path })
    } catch (err) {
      setUploadErr(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="grid">
      <div className="panel grid">
        <span className="hud">THEME</span>
        <div className="row wrap" style={{ gap: '0.6rem' }}>
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className="btn-ghost"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                outline: theme === t.id ? '1px solid var(--accent)' : 'none',
              }}
            >
              <span style={{ width: 16, height: 16, borderRadius: '50%', background: t.swatch, flexShrink: 0 }} />
              {t.label}
            </button>
          ))}
        </div>
        {theme === 'custom' && (
          <div className="row" style={{ gap: '0.7rem', alignItems: 'center', marginTop: '0.3rem' }}>
            <input
              type="color"
              value={appearance.customCardColor || '#10182c'}
              onChange={e => setAppearance({ customCardColor: e.target.value })}
              style={{ width: 44, height: 36, border: 'none', borderRadius: 8, background: 'none', padding: 0 }}
            />
            <span className="item-sub">Pick a card color — everything else stays the Void look.</span>
          </div>
        )}
      </div>

      <div className="panel grid">
        <span className="hud">UI SCALE</span>
        <div className="row wrap" style={{ gap: '0.5rem' }}>
          {Object.entries(SCALE_STEPS).map(([label, val]) => (
            <button
              key={label}
              className="btn-ghost"
              style={{ outline: appearance.uiScale === val ? '1px solid var(--accent)' : 'none' }}
              onClick={() => setAppearance({ uiScale: val })}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="item-sub">Scales spacing, icons, and text together — applies everywhere, synced across your devices.</span>
      </div>

      <div className="panel grid">
        <span className="hud">CARD TRANSPARENCY</span>
        <input
          type="range" min="0.3" max="1" step="0.05"
          value={appearance.cardOpacity ?? 0.72}
          onChange={e => setAppearance({ cardOpacity: Number(e.target.value) })}
        />
        <div className="row between">
          <button className="btn-ghost" onClick={() => setAppearance({ cardOpacity: null })}>Reset to theme default</button>
        </div>
      </div>

      <div className="panel grid">
        <span className="hud">BACKGROUND ART</span>
        <div className="row wrap" style={{ gap: '0.5rem' }}>
          {[
            { id: 'starfield', label: 'Starfield (full)' },
            { id: 'calm', label: 'Calm (lighter)' },
            { id: 'off', label: 'Off (flat color)' },
            { id: 'custom', label: 'Custom image' },
          ].map(o => (
            <button
              key={o.id}
              className="btn-ghost"
              style={{ outline: appearance.backgroundArt === o.id ? '1px solid var(--accent)' : 'none' }}
              onClick={() => o.id === 'custom' ? document.getElementById('bg-upload-input')?.click() : setAppearance({ backgroundArt: o.id })}
            >
              {o.label}
            </button>
          ))}
          <input id="bg-upload-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadBackground} disabled={uploading} />
        </div>
        {uploading && <span className="item-sub">Uploading…</span>}
        {uploadErr && <div className="auth-err">{uploadErr}</div>}
        {appearance.backgroundArt === 'custom' && appearance.customBackgroundPath && (
          <span className="item-sub">Using your uploaded image. Tap "Custom image" again to replace it.</span>
        )}
        <span className="item-sub">"Calm" and "Off" use less battery on older phones.</span>
      </div>
    </div>
  )
}
