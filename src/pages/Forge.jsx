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
  const [dueDate, setDueDate] = useState('')
  const [q, setQ] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [err, setErr] = useState('')

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
    setErr('')
    const { error } = await supabase.from('tasks').insert({
      user_id: uid, title: title.trim(), project_id: projectId || null, due_date: dueDate || null,
    })
    if (error) { setErr(error.message); return }
    setTitle(''); setDueDate(''); load()
  }
  const toggle = async t => {
    setErr('')
    const { error } = await supabase.from('tasks').update({
      completed: !t.completed, completed_at: !t.completed ? new Date().toISOString() : null,
    }).eq('id', t.id)
    if (error) { setErr(error.message); return }
    load()
  }
  const del = async id => {
    if (!window.confirm('Delete this task? This cannot be undone.')) return
    setErr('')
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) { setErr(error.message); return }
    load()
  }

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
        <input className="input" type="date" style={{ flex: 1, minWidth: 130 }} value={dueDate} onChange={e => setDueDate(e.target.value)} title="Due date (optional)" />
        <button className="btn-sm" onClick={add}>Add</button>
      </div>
      <input className="input" style={{ marginBottom: '0.8rem' }} placeholder="Search tasks" value={q} onChange={e => setQ(e.target.value)} />
      {err && <div className="auth-err">{err}</div>}

      <div className="list">
        {open.length === 0 && <div className="empty">No open tasks.</div>}
        {open.map(t => (
          <div className="item" key={t.id}>
            <button className="check" onClick={() => toggle(t)} aria-label="Complete" />
            <div style={{ flex: 1 }}>
              <div className="item-title">{t.title}</div>
              {(t.project_id || t.due_date) && (
                <div className="item-sub">
                  {t.project_id ? pname(t.project_id) : ''}{t.project_id && t.due_date ? ' · ' : ''}{t.due_date ? `Due ${t.due_date}` : ''}
                </div>
              )}
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
  const [err, setErr] = useState('')

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
    setErr('')
    const { error } = await supabase.from('projects').insert({ user_id: uid, name: name.trim(), deadline: deadline || null })
    if (error) { setErr(error.message); return }
    setName(''); setDeadline(''); load()
  }
  const setStatus = async (id, status) => {
    setErr('')
    const { error } = await supabase.from('projects').update({ status }).eq('id', id)
    if (error) { setErr(error.message); return }
    load()
  }
  const del = async id => {
    if (!window.confirm('Delete this project? Linked tasks will keep their project reference removed. This cannot be undone.')) return
    setErr('')
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) { setErr(error.message); return }
    load()
  }

  return (
    <div className="panel">
      <div className="row wrap" style={{ marginBottom: '0.9rem' }}>
        <input className="input" style={{ flex: 2, minWidth: 150 }} placeholder="New project"
          value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <input className="input" type="date" style={{ flex: 1, minWidth: 130 }} value={deadline} onChange={e => setDeadline(e.target.value)} />
        <button className="btn-sm" onClick={add}>Add</button>
      </div>
      {err && <div className="auth-err">{err}</div>}
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
  const [toast, setToast] = useState('')
  const timer = useRef(null)
  const audioCtxRef = useRef(null)
  const endTimeRef = useRef(null) // absolute ms timestamp the current phase ends — survives throttled/backgrounded intervals

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    return () => { audioCtxRef.current?.close?.() }
  }, [])

  // Must be called from a direct user gesture (e.g. the Start button) — browsers
  // block audio playback that isn't tied to user activation. Creating/resuming
  // the context here, then reusing it later from the timer callback, is the
  // standard workaround for "no sound on completion" bugs.
  const unlockAudio = () => {
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext
        audioCtxRef.current = new Ctx()
      }
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
    } catch { /* audio unsupported, ignore */ }
  }

  const beep = () => {
    try {
      const ctx = audioCtxRef.current
      if (!ctx) return
      if (ctx.state === 'suspended') ctx.resume()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(); osc.stop(ctx.currentTime + 0.55)
    } catch { /* audio unsupported, ignore */ }
  }

  const notifyDone = (title, body) => {
    beep()
    if (navigator.vibrate) navigator.vibrate([180, 90, 180])
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body }) } catch { /* ignore */ }
    }
    setToast(title)
    setTimeout(() => setToast(''), 4000)
  }

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
    unlockAudio()
    await supabase.from('user_settings').update({ focus_duration_min: focusMin, break_duration_min: breakMin }).eq('user_id', uid)
    endTimeRef.current = Date.now() + Math.round(focusMin * 60) * 1000
    setPhase('focus'); setLeft(Math.round(focusMin * 60))
  }
  const stop = () => { clearInterval(timer.current); endTimeRef.current = null; setPhase('idle'); setLeft(null) }

  // Timestamp-based countdown — reading (endTime - now) instead of decrementing
  // a counter means the timer stays accurate even if setInterval gets throttled
  // or paused while the screen is locked or the app is backgrounded; it snaps
  // back to the correct remaining time the instant the tab/app is visible again.
  useEffect(() => {
    if (phase === 'idle' || !endTimeRef.current) return
    const tick = () => setLeft(Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000)))
    tick()
    timer.current = setInterval(tick, 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer.current); document.removeEventListener('visibilitychange', onVisible) }
  }, [phase])

  useEffect(() => {
    if (left === 0) {
      clearInterval(timer.current)
      if (phase === 'focus') {
        supabase.from('focus_sessions').insert({ user_id: uid, duration_min: focusMin, completed: true }).then(loadStreak)
        notifyDone('Focus session complete', 'Time for a break.')
        endTimeRef.current = Date.now() + Math.round(breakMin * 60) * 1000
        setPhase('break'); setLeft(Math.round(breakMin * 60))
      } else {
        notifyDone('Break over', 'Ready for another focus session?')
        endTimeRef.current = null
        setPhase('idle'); setLeft(null)
      }
    }
  }, [left]) // eslint-disable-line

  const idleTotal = Math.round(focusMin * 60)
  const mm = left !== null ? String(Math.floor(left / 60)).padStart(2, '0') : String(Math.floor(idleTotal / 60)).padStart(2, '0')
  const ss = left !== null ? String(left % 60).padStart(2, '0') : String(idleTotal % 60).padStart(2, '0')

  return (
    <div className="panel" style={{ textAlign: 'center' }}>
      {toast && <div className="pill accent" style={{ display: 'block', marginBottom: '0.7rem' }}>{toast}</div>}
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
