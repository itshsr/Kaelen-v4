import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const today = () => new Date().toISOString().slice(0, 10)

export function useHabits(uid) {
  const [habits, setHabits] = useState([])
  const [doneToday, setDoneToday] = useState(new Set())
  const [streaks, setStreaks] = useState({})

  const load = async () => {
    const [{ data: h }, { data: c }] = await Promise.all([
      supabase.from('habits').select('*').order('created_at'),
      supabase.from('habit_completions').select('habit_id,completed_on').order('completed_on', { ascending: false }),
    ])
    setHabits(h || [])
    const t = today()
    setDoneToday(new Set((c || []).filter(x => x.completed_on === t).map(x => x.habit_id)))
    // streak: consecutive days ending today or yesterday
    const byHabit = {}
    ;(c || []).forEach(x => { (byHabit[x.habit_id] ||= new Set()).add(x.completed_on) })
    const s = {}
    ;(h || []).forEach(hb => {
      const days = byHabit[hb.id] || new Set()
      let streak = 0
      const d = new Date()
      if (!days.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1)
      while (days.has(d.toISOString().slice(0, 10))) { streak++; d.setDate(d.getDate() - 1) }
      s[hb.id] = streak
    })
    setStreaks(s)
  }
  useEffect(() => { if (uid) load() }, [uid]) // eslint-disable-line

  const toggle = async habitId => {
    if (doneToday.has(habitId)) {
      await supabase.from('habit_completions').delete().eq('habit_id', habitId).eq('completed_on', today())
    } else {
      await supabase.from('habit_completions').insert({ user_id: uid, habit_id: habitId, completed_on: today() })
    }
    load()
  }
  const add = async name => {
    if (!name.trim()) return
    await supabase.from('habits').insert({ user_id: uid, name: name.trim() })
    load()
  }
  const remove = async id => { await supabase.from('habits').delete().eq('id', id); load() }

  return { habits, doneToday, streaks, toggle, add, remove }
}

function Habits({ uid }) {
  const { habits, doneToday, streaks, toggle, add, remove } = useHabits(uid)
  const [name, setName] = useState('')
  return (
    <div className="panel">
      <div className="row" style={{ marginBottom: '0.9rem' }}>
        <input className="input" placeholder="New habit" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (add(name), setName(''))} />
        <button className="btn-sm" onClick={() => { add(name); setName('') }}>Add</button>
      </div>
      <div className="list">
        {habits.length === 0 && <div className="empty">No habits yet.</div>}
        {habits.map(h => (
          <div className="item" key={h.id}>
            <button className={`check ${doneToday.has(h.id) ? 'on' : ''}`} onClick={() => toggle(h.id)}>
              {doneToday.has(h.id) ? '✓' : ''}
            </button>
            <div style={{ flex: 1 }}>
              <div className="item-title">{h.name}</div>
              <div className="item-sub">{streaks[h.id] || 0} day streak</div>
            </div>
            <button className="btn-ghost danger" onClick={() => remove(h.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Notes({ uid }) {
  const [notes, setNotes] = useState([])
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | note object
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const load = async () => {
    const { data } = await supabase.from('notes').select('*').order('updated_at', { ascending: false })
    setNotes(data || [])
  }
  useEffect(() => { if (uid) load() }, [uid])

  const openNew = () => { setEditing('new'); setTitle(''); setContent('') }
  const openEdit = n => { setEditing(n); setTitle(n.title); setContent(n.content || '') }
  const save = async () => {
    if (!title.trim()) return
    if (editing === 'new') {
      await supabase.from('notes').insert({ user_id: uid, title: title.trim(), content })
    } else {
      await supabase.from('notes').update({ title: title.trim(), content, updated_at: new Date().toISOString() }).eq('id', editing.id)
    }
    setEditing(null); load()
  }
  const del = async id => { await supabase.from('notes').delete().eq('id', id); setEditing(null); load() }

  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(q.toLowerCase()) || (n.content || '').toLowerCase().includes(q.toLowerCase()))

  if (editing !== null) {
    return (
      <div className="panel grid">
        <input className="input" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className="input" rows={8} placeholder="Write…" value={content} onChange={e => setContent(e.target.value)} />
        <div className="row">
          <button className="btn-sm" onClick={save}>Save note</button>
          <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          {editing !== 'new' && <button className="btn-ghost danger" onClick={() => del(editing.id)}>Delete</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="row" style={{ marginBottom: '0.9rem' }}>
        <input className="input" placeholder="Search notes" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn-sm" onClick={openNew}>New</button>
      </div>
      <div className="list">
        {filtered.length === 0 && <div className="empty">No notes.</div>}
        {filtered.map(n => (
          <div className="item" key={n.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(n)}>
            <div style={{ flex: 1 }}>
              <div className="item-title" style={{ fontWeight: 600 }}>{n.title}</div>
              {n.content && <div className="item-sub">{n.content.slice(0, 80)}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Grimoire() {
  const [uid, setUid] = useState(null)
  const [tab, setTab] = useState('notes')
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data.user?.id)) }, [])
  return (
    <>
      <div className="section-head">
        <h2 className="display">GRIMOIRE</h2>
        <span className="hud">05 — LORE · LIVE</span>
      </div>
      <div className="tabs">
        {['notes', 'habits'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t.toUpperCase()}</button>
        ))}
      </div>
      {uid && tab === 'notes' && <Notes uid={uid} />}
      {uid && tab === 'habits' && <Habits uid={uid} />}
    </>
  )
}
