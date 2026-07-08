import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

function useUid() {
  const [uid, setUid] = useState(null)
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data.user?.id)) }, [])
  return uid
}

/* ---------- Tasks ---------- */
function Tasks({ uid }) {
  const [tasks, setTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [q, setQ] = useState('')
  const [showDone, setShowDone] = useState(false)

  const load = async () => {
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('id,name').order('name'),
    ])
    setTasks(t || []); setProjects(p || [])
  }
  useEffect(() => { if (uid) load() }, [uid])

  const add = async () => {
    if (!title.trim()) return
    const { error } = await supabase.from('tasks').insert({
      user_id: uid, title: title.trim(), project_id: projectId || null,
    })
    if (!error) { setTitle(''); load() }
  }
  const toggle = async t => {
    await supabase.from('tasks').update({
      completed: !t.completed, completed_at: !t.completed ? new Date().toISOString() : null,
    }).eq('id', t.id)
    load()
  }
  const del = async id => { await supabase.from('tasks').delete().eq('id', id); load() }

  const filtered = useMemo(() =>
    tasks.filter(t => t.title.toLowerCase().includes(q.toLowerCase())), [tasks, q])
  const open = filtered.filter(t => !t.completed)
  const done = filtered.filter(t => t.completed)
  const pname = id => projects.find(p => p.id === id)?.name

  return (
    <div className="panel">
      <div className="row wrap" style={{ marginBottom: '0.8rem' }}>
        <input className="input" style={{ flex: 2, minWidth: 150 }} placeholder="New task"
          value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <select className="input" style={{ flex: 1, minWidth: 120 }} value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">No project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn-sm" onClick={add}>Add</button>
      </div>
      <input className="input" style={{ marginBottom: '0.8rem' }} placeholder="Search tasks" value={q} onChange={e => setQ(e.target.value)} />

      <div className="list">
        {open.length === 0 && <div className="empty">No open tasks.</div>}
        {open.map(t => (
          <div className="item" key={t.id}>
            <button className="check" onClick={() => toggle(t)} aria-label="Complete" />
            <div style={{ flex: 1 }}>
              <div className="item-title">{t.title}</div>
              {t.project_id && <div className="item-sub">{pname(t.project_id)}</div>}
            </div>
            <button className="btn-ghost danger" onClick={() => del(t.id)}>✕</button>
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <>
          <button className="btn-ghost" style={{ margin: '0.9rem 0 0.5rem' }} onClick={() => setShowDone(!showDone)}>
            {showDone ? 'Hide' : 'Show'} completed ({done.length})
          </button>
          {showDone && (
            <div className="list">
              {done.map(t => (
                <div className="item done" key={t.id}>
                  <button className="check on" onClick={() => toggle(t)}>✓</button>
                  <div className="item-title" style={{ flex: 1 }}>{t.title}</div>
                  <button className="btn-ghost danger" onClick={() => del(t.id)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ---------- Projects ---------- */
const STATUSES = ['Not Started', 'In Progress', 'On Hold', 'Completed']
function Projects({ uid }) {
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [name, setName] = useState('')
  const [deadline, setDeadline] = useState('')

  const load = async () => {
    const [{ data: p }, { data: t }] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('tasks').select('id,project_id,completed'),
    ])
    setProjects(p || []); setTasks(t || [])
  }
  useEffect(() => { if (uid) load() }, [uid])

  const add = async () => {
    if (!name.trim()) return
    await supabase.from('projects').insert({ user_id: uid, name: name.trim(), deadline: deadline || null })
    setName(''); setDeadline(''); load()
  }
  const setStatus = async (id, status) => { await supabase.from('projects').update({ status }).eq('id', id); load() }
  const del = async id => { await supabase.from('projects').delete().eq('id', id); load() }

  return (
    <div className="panel">
      <div className="row wrap" style={{ marginBottom: '0.9rem' }}>
        <input className="input" style={{ flex: 2, minWidth: 150 }} placeholder="New project"
          value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <input className="input" type="date" style={{ flex: 1, minWidth: 130 }} value={deadline} onChange={e => setDeadline(e.target.value)} />
        <button className="btn-sm" onClick={add}>Add</button>
      </div>
      <div className="list">
        {projects.length === 0 && <div className="empty">No projects yet.</div>}
        {projects.map(p => {
          const pt = tasks.filter(t => t.project_id === p.id)
          const dc = pt.filter(t => t.completed).length
          const pct = pt.length ? Math.round((dc / pt.length) * 100) : 0
          return (
            <div className="item" key={p.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.55rem' }}>
              <div className="row between">
                <div className="item-title" style={{ fontWeight: 600 }}>{p.name}</div>
                <button className="btn-ghost danger" onClick={() => del(p.id)}>✕</button>
              </div>
              <div className="row between wrap">
                <select className="input" style={{ width: 'auto' }} value={p.status} onChange={e => setStatus(p.id, e.target.value)}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
                <span className="item-sub">{pt.length ? `${dc} of ${pt.length} tasks · ${pct}%` : 'No linked tasks'}</span>
                {p.deadline && <span className="pill warm">due {p.deadline}</span>}
              </div>
              <div className="progress"><div style={{ width: `${pct}%` }} /></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Focus ---------- */
function Focus({ uid }) {
  const [focusMin, setFocusMin] = useState(25)
  const [breakMin, setBreakMin] = useState(5)
  const [left, setLeft] = useState(null) // seconds
  const [phase, setPhase] = useState('idle') // idle | focus | break
  const [streak, setStreak] = useState(0)
  const timer = useRef(null)

  useEffect(() => {
    if (!uid) return
    supabase.from('user_settings').select('*').eq('user_id', uid).single().then(({ data }) => {
      if (data) { setFocusMin(data.focus_duration_min); setBreakMin(data.break_duration_min) }
    })
    loadStreak()
  }, [uid])

  const loadStreak = async () => {
    const today = new Date().toISOString().slice(0, 10)
    const { count } = await supabase.from('focus_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('session_date', today).eq('completed', true)
    setStreak(count || 0)
  }

  const start = async () => {
    await supabase.from('user_settings').update({ focus_duration_min: focusMin, break_duration_min: breakMin }).eq('user_id', uid)
    setPhase('focus'); setLeft(Math.round(focusMin * 60))
  }
  const stop = () => { clearInterval(timer.current); setPhase('idle'); setLeft(null) }

  useEffect(() => {
    if (phase === 'idle' || left === null) return
    timer.current = setInterval(() => setLeft(l => l - 1), 1000)
    return () => clearInterval(timer.current)
  }, [phase]) // eslint-disable-line

  useEffect(() => {
    if (left === 0) {
      clearInterval(timer.current)
      if (phase === 'focus') {
        supabase.from('focus_sessions').insert({ user_id: uid, duration_min: focusMin, completed: true }).then(loadStreak)
        setPhase('break'); setLeft(Math.round(breakMin * 60))
      } else {
        setPhase('idle'); setLeft(null)
      }
    }
  }, [left]) // eslint-disable-line

  const idleTotal = Math.round(focusMin * 60)
  const mm = left !== null ? String(Math.floor(left / 60)).padStart(2, '0') : String(Math.floor(idleTotal / 60)).padStart(2, '0')
  const ss = left !== null ? String(left % 60).padStart(2, '0') : String(idleTotal % 60).padStart(2, '0')

  return (
    <div className="panel" style={{ textAlign: 'center' }}>
      <div className="hud" style={{ marginBottom: '0.6rem' }}>
        {phase === 'idle' ? 'FOCUS · STANDBY' : phase === 'focus' ? 'FOCUS · RUNNING' : 'BREAK · RUNNING'}
      </div>
      <div className="timer-display">{mm}:{ss}</div>
      <div className="hud" style={{ margin: '0.4rem 0 1.1rem' }}>{streak} session{streak === 1 ? '' : 's'} completed today</div>

      {phase === 'idle' ? (
        <>
          <div className="row wrap" style={{ justifyContent: 'center', marginBottom: '0.9rem' }}>
            <label className="hud">Focus (min)</label>
            <input className="input" type="number" min="0.1" step="0.1" max="180" style={{ width: 80 }} value={focusMin} onChange={e => setFocusMin(+e.target.value || 0.1)} />
            <label className="hud">Break (min)</label>
            <input className="input" type="number" min="0.1" step="0.1" max="60" style={{ width: 80 }} value={breakMin} onChange={e => setBreakMin(+e.target.value || 0.1)} />
          </div>
          <button className="btn-sm" onClick={start}>Start focus</button>
        </>
      ) : (
        <button className="btn-ghost danger" onClick={stop}>Stop session</button>
      )}
    </div>
  )
}

export default function Forge() {
  const uid = useUid()
  const [tab, setTab] = useState('tasks')
  return (
    <>
      <div className="section-head">
        <h2 className="display">FORGE</h2>
        <span className="hud">03 — WORK · LIVE</span>
      </div>
      <div className="tabs">
        {['tasks', 'projects', 'focus'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t.toUpperCase()}</button>
        ))}
      </div>
      {uid && tab === 'tasks' && <Tasks uid={uid} />}
      {uid && tab === 'projects' && <Projects uid={uid} />}
      {uid && tab === 'focus' && <Focus uid={uid} />}
    </>
  )
}
