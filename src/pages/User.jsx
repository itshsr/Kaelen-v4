import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function User() {
  const [uid, setUid] = useState(null)
  const [tab, setTab] = useState('profile')
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data.user?.id)) }, [])
  return (
    <>
      <div className="section-head">
        <h2 className="display">USER</h2>
        <span className="hud">07 — SELF · LIVE</span>
      </div>
      <div className="tabs">
        {['profile', 'people', 'ai key'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t.toUpperCase()}</button>
        ))}
      </div>
      {uid && tab === 'profile' && <Profile uid={uid} />}
      {uid && tab === 'people' && <People uid={uid} />}
      {uid && tab === 'ai key' && <ApiKey uid={uid} />}
    </>
  )
}

function Profile({ uid }) {
  const [p, setP] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', uid).single().then(({ data }) => setP(data))
  }, [uid])

  const set = (k, v) => setP(prev => ({ ...prev, [k]: v }))
  const save = async () => {
    const { error } = await supabase.from('profiles').update({
      name: p.name, role: p.role, city: p.city,
      birth_date: p.birth_date || null, birth_time: p.birth_time || null, birth_place: p.birth_place,
    }).eq('id', uid)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
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
      <span className="hud">Birth details feed ORACLE readings in Phase 4.</span>
    </div>
  )
}

function People({ uid }) {
  const [people, setPeople] = useState([])
  const [form, setForm] = useState({ name: '', relationship: '', birth_date: '', birth_time: '', birth_place: '', emoji: '', city: '', notes: '' })

  const load = async () => {
    const { data } = await supabase.from('people_profiles').select('*').order('created_at')
    setPeople(data || [])
  }
  useEffect(() => { if (uid) load() }, [uid])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const add = async () => {
    if (!form.name.trim()) return
    await supabase.from('people_profiles').insert({
      user_id: uid, ...form,
      birth_date: form.birth_date || null, birth_time: form.birth_time || null,
    })
    setForm({ name: '', relationship: '', birth_date: '', birth_time: '', birth_place: '', emoji: '', city: '', notes: '' })
    load()
  }
  const del = async id => { await supabase.from('people_profiles').delete().eq('id', id); load() }

  return (
    <div className="grid">
      <div className="panel grid">
        <div className="grid cols2">
          <input className="input" placeholder="Name *" value={form.name} onChange={e => set('name', e.target.value)} />
          <input className="input" placeholder="Relationship" value={form.relationship} onChange={e => set('relationship', e.target.value)} />
          <input className="input" placeholder="Emoji" value={form.emoji} onChange={e => set('emoji', e.target.value)} />
          <input className="input" placeholder="City" value={form.city} onChange={e => set('city', e.target.value)} />
          <input className="input" type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />
          <input className="input" type="time" value={form.birth_time} onChange={e => set('birth_time', e.target.value)} />
          <input className="input" placeholder="Birth place" value={form.birth_place} onChange={e => set('birth_place', e.target.value)} />
          <input className="input" placeholder="Notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <button className="btn-sm" onClick={add}>Add person</button>
      </div>
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

  useEffect(() => {
    supabase.from('profiles').select('gemini_api_key').eq('id', uid).single().then(({ data }) => {
      if (data?.gemini_api_key) { setKey(data.gemini_api_key); setActive(true) }
    })
  }, [uid])

  const save = async () => {
    const { error } = await supabase.from('profiles').update({ gemini_api_key: key.trim() || null }).eq('id', uid)
    if (!error) {
      setActive(!!key.trim()); setSaved(true); setTimeout(() => setSaved(false), 2000)
    }
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
      <span className="hud">AI layer activates in Phase 3. No calls are made until then.</span>
    </div>
  )
}
