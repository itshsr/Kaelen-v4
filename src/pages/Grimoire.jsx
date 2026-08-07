import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSupabaseTable } from '../lib/useSupabaseTable'
import { useHabits } from '../lib/useHabits'
import PdfReader from '../components/PdfReader'
import { useConfirm } from '../lib/ConfirmContext'


function Habits({ uid }) {
  const confirm = useConfirm()
  const { habits, doneToday, streaks, toggle, add, remove, err } = useHabits(uid)
  const [name, setName] = useState('')
  const del = async id => {
    if (!(await confirm('Delete this habit? Its streak history will be lost. This cannot be undone.'))) return
    remove(id)
  }
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
            <button className="btn-ghost danger" onClick={() => del(h.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Notes({ uid }) {
  const confirm = useConfirm()
  const { rows: notes, err, insert, update, remove } = useSupabaseTable('notes', {
    orderBy: { column: 'updated_at', ascending: false },
    enabled: !!uid,
  })
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | note object
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const openNew = () => { setEditing('new'); setTitle(''); setContent('') }
  const openEdit = n => { setEditing(n); setTitle(n.title); setContent(n.content || '') }
  const save = async () => {
    if (!title.trim()) return
    const result = editing === 'new'
      ? await insert({ user_id: uid, title: title.trim(), content })
      : await update(editing.id, { title: title.trim(), content, updated_at: new Date().toISOString() })
    if (!result.error) setEditing(null)
  }
  const del = async id => {
    if (!(await confirm('Delete this note? This cannot be undone.'))) return
    const result = await remove(id)
    if (!result.error) setEditing(null)
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
  const confirm = useConfirm()
  const { rows: books, err, reload, remove, update } = useSupabaseTable('ebooks', {
    orderBy: { column: 'created_at', ascending: false },
    enabled: !!uid,
  })
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [open, setOpen] = useState(null) // book being read

  const upload = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadErr(''); setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${uid}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('ebooks').upload(path, file)
      if (upErr) throw upErr
      // Bucket is private — store the storage path, not a public URL (public URLs
      // 404 on a private bucket). A fresh signed URL is generated when opening.
      const { error: insErr } = await supabase.from('ebooks').insert({
        user_id: uid, title: file.name.replace(/\.[^.]+$/, ''), file_path: path,
        file_type: 'pdf',
      })
      if (insErr) throw insErr
      reload()
    } catch (e2) { setUploadErr(e2.message) } finally { setUploading(false) }
  }

  const del = async book => {
    if (!(await confirm('Delete this book? This cannot be undone.'))) return
    if (book.file_path) {
      const { error: storErr } = await supabase.storage.from('ebooks').remove([book.file_path])
      if (storErr) { setUploadErr(storErr.message); return }
    }
    remove(book.id)
  }

  const saveProgress = (book, current_page) => update(book.id, { current_page })

  if (open) {
    if (open.file_type === 'epub') {
      return (
        <div className="panel placeholder">
          <span className="hud">EPUB READING · NOT YET SUPPORTED</span>
          <span className="big">In-app reading currently supports PDF only.</span>
          <button className="btn-ghost" onClick={() => setOpen(null)}>Back</button>
        </div>
      )
    }
    return (
      <PdfReader
        book={open}
        uid={uid}
        onProgress={n => saveProgress(open, n)}
        onClose={() => setOpen(null)}
      />
    )
  }

  return (
    <div className="panel">
      <div className="row" style={{ marginBottom: '0.9rem' }}>
        <label className="btn-sm" style={{ cursor: 'pointer' }}>
          {uploading ? 'Uploading…' : 'Upload PDF'}
          <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={upload} disabled={uploading} />
        </label>
      </div>
      <span className="hud" style={{ display: 'block', marginBottom: '0.6rem' }}>EPUB support coming soon — PDF only for now</span>
      {(err || uploadErr) && <div className="auth-err">{uploadErr || err}</div>}
      <div className="list">
        {books.length === 0 && <div className="empty">No books yet.</div>}
        {books.map(b => (
          <div className="item" key={b.id}>
            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setOpen(b)}>
              <div className="item-title" style={{ fontWeight: 600 }}>{b.title}</div>
              <div className="item-sub">{b.file_type.toUpperCase()} · page {b.current_page || 0}{b.total_pages ? ` / ${b.total_pages}` : ''}</div>
            </div>
            <button className="btn-ghost danger" onClick={() => del(b)}>✕</button>
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
