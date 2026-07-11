import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const today = () => new Date().toISOString().slice(0, 10)

export function useHabits(uid) {
  const [habits, setHabits] = useState([])
  const [doneToday, setDoneToday] = useState(new Set())
  const [streaks, setStreaks] = useState({})
  const [err, setErr] = useState('')

  const load = async () => {
    const [{ data: h, error: he }, { data: c, error: ce }] = await Promise.all([
      supabase.from('habits').select('*').order('created_at'),
      supabase.from('habit_completions').select('habit_id,completed_on').order('completed_on', { ascending: false }),
    ])
    if (he || ce) { setErr((he || ce).message) }
    setHabits(h || [])
    const t = today()
    setDoneToday(new Set((c || []).filter(x => x.completed_on === t).map(x => x.habit_id)))
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
    setErr('')
    let error
    if (doneToday.has(habitId)) {
      ;({ error } = await supabase.from('habit_completions').delete().eq('habit_id', habitId).eq('completed_on', today()))
    } else {
      ;({ error } = await supabase.from('habit_completions').insert({ user_id: uid, habit_id: habitId, completed_on: today() }))
    }
    if (error) { setErr(error.message); return }
    load()
  }
  const add = async name => {
    setErr('')
    if (!name.trim()) return
    const { error } = await supabase.from('habits').insert({ user_id: uid, name: name.trim() })
    if (error) { setErr(error.message); return }
    load()
  }
  const remove = async id => {
    setErr('')
    const { error } = await supabase.from('habits').delete().eq('id', id)
    if (error) { setErr(error.message); return }
    load()
  }

  return { habits, doneToday, streaks, toggle, add, remove, err }
}

function Habits({ uid }) {
  const { habits, doneToday, streaks, toggle, add, remove, err } = useHabits(uid)
  const [name, setName] = useState('')
  return (
    <div className="panel">
      <div className="row" style={{ marginBottom: '0.9rem' }}>
        <input className="input" placeholder="New habit" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (add(name), setName(''))} />
        <button className="btn-sm" onClick={() => { add(name); setName('') }}>Add</button>
      </div>
      {err && <div className="auth-err">{err}</div>}
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
  const [err, setErr] = useState('')

  const load = async () => {
    const { data, error } = await supabase.from('notes').select('*').order('updated_at', { ascending: false })
    if (error) setErr(error.message)
    setNotes(data || [])
  }
  useEffect(() => { if (uid) load() }, [uid])

  const openNew = () => { setEditing('new'); setTitle(''); setContent(''); setErr('') }
  const openEdit = n => { setEditing(n); setTitle(n.title); setContent(n.content || ''); setErr('') }
  const save = async () => {
    setErr('')
    if (!title.trim()) return
    const query = editing === 'new'
      ? supabase.from('notes').insert({ user_id: uid, title: title.trim(), content })
      : supabase.from('notes').update({ title: title.trim(), content, updated_at: new Date().toISOString() }).eq('id', editing.id)
    const { error } = await query
    if (error) { setErr(error.message); return }
    setEditing(null); load()
  }
  const del = async id => {
    setErr('')
    const { error } = await supabase.from('notes').delete().eq('id', id)
    if (error) { setErr(error.message); return }
    setEditing(null); load()
  }

  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(q.toLowerCase()) || (n.content || '').toLowerCase().includes(q.toLowerCase()))

  if (editing !== null) {
    return (
      <div className="panel grid">
        {err && <div className="auth-err">{err}</div>}
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
      {err && <div className="auth-err">{err}</div>}
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

function Ebooks({ uid }) {
  const [books, setBooks] = useState([])
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(null) // book being annotated
  const [quote, setQuote] = useState('')
  const [page, setPage] = useState('')
  const [highlights, setHighlights] = useState([])

  const load = async () => {
    const { data, error } = await supabase.from('ebooks').select('*').order('created_at', { ascending: false })
    if (error) setErr(error.message)
    setBooks(data || [])
  }
  useEffect(() => { if (uid) load() }, [uid])

  const upload = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(''); setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${uid}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('ebooks').upload(path, file)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('ebooks').getPublicUrl(path)
      const { error: insErr } = await supabase.from('ebooks').insert({
        user_id: uid, title: file.name.replace(/\.[^.]+$/, ''), file_url: urlData.publicUrl,
        file_type: ext?.toLowerCase() === 'epub' ? 'epub' : 'pdf',
      })
      if (insErr) throw insErr
      load()
    } catch (e2) { setErr(e2.message) } finally { setUploading(false) }
  }

  const del = async id => {
    setErr('')
    const { error } = await supabase.from('ebooks').delete().eq('id', id)
    if (error) { setErr(error.message); return }
    load()
  }

  const setProgress = async (book, current_page) => {
    setErr('')
    const { error } = await supabase.from('ebooks').update({ current_page }).eq('id', book.id)
    if (error) { setErr(error.message); return }
    load()
  }

  const openBook = async book => {
    setOpen(book)
    const { data } = await supabase.from('ebook_highlights').select('*').eq('ebook_id', book.id).order('created_at', { ascending: false })
    setHighlights(data || [])
  }

  const addHighlight = async () => {
    if (!quote.trim()) return
    setErr('')
    const { error } = await supabase.from('ebook_highlights').insert({
      user_id: uid, ebook_id: open.id, quote: quote.trim(), page: page ? parseInt(page) : null,
    })
    if (error) { setErr(error.message); return }
    setQuote(''); setPage(''); openBook(open)
  }

  if (open) {
    return (
      <div className="panel grid">
        <div className="row between">
          <span className="item-title" style={{ fontWeight: 600 }}>{open.title}</span>
          <button className="btn-ghost" onClick={() => setOpen(null)}>Back</button>
        </div>
        <a className="btn-ghost" style={{ textDecoration: 'none', display: 'inline-block', width: 'fit-content' }}
          href={open.file_url} target="_blank" rel="noreferrer">Open file →</a>
        <div className="row">
          <label className="hud">Current page</label>
          <input className="input" type="number" min="0" style={{ width: 100 }}
            defaultValue={open.current_page || 0}
            onBlur={e => setProgress(open, parseInt(e.target.value) || 0)} />
        </div>
        {err && <div className="auth-err">{err}</div>}
        <div className="row wrap">
          <input className="input" placeholder="Highlight / quote" style={{ flex: 2, minWidth: 140 }} value={quote} onChange={e => setQuote(e.target.value)} />
          <input className="input" type="number" placeholder="Page" style={{ flex: 1, minWidth: 80 }} value={page} onChange={e => setPage(e.target.value)} />
          <button className="btn-sm" onClick={addHighlight}>Save</button>
        </div>
        <div className="list">
          {highlights.length === 0 && <div className="empty">No highlights yet.</div>}
          {highlights.map(h => (
            <div className="item" key={h.id}>
              <div style={{ flex: 1 }}>
                <div className="item-title">{h.quote}</div>
                {h.page != null && <div className="item-sub">page {h.page}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="row" style={{ marginBottom: '0.9rem' }}>
        <label className="btn-sm" style={{ cursor: 'pointer' }}>
          {uploading ? 'Uploading…' : 'Upload PDF/EPUB'}
          <input type="file" accept=".pdf,.epub" style={{ display: 'none' }} onChange={upload} disabled={uploading} />
        </label>
      </div>
      {err && <div className="auth-err">{err}</div>}
      <div className="list">
        {books.length === 0 && <div className="empty">No books yet.</div>}
        {books.map(b => (
          <div className="item" key={b.id}>
            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openBook(b)}>
              <div className="item-title" style={{ fontWeight: 600 }}>{b.title}</div>
              <div className="item-sub">{b.file_type.toUpperCase()} · page {b.current_page || 0}</div>
            </div>
            <button className="btn-ghost danger" onClick={() => del(b.id)}>✕</button>
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
        {['notes', 'habits', 'ebooks'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t.toUpperCase()}</button>
        ))}
      </div>
      {uid && tab === 'notes' && <Notes uid={uid} />}
      {uid && tab === 'habits' && <Habits uid={uid} />}
      {uid && tab === 'ebooks' && <Ebooks uid={uid} />}
    </>
  )
}
