import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCalendarData, dayItems, conflictIds, today, addDays, startOfWeek, minutesOf, isoDate, resyncEventNotifications } from '../lib/calendarData'
import { ensureNotificationPermission } from '../lib/notifications'

const CATEGORIES = ['Meeting', 'Work', 'Personal', 'Reminder']
const CAT_COLOR = {
  Meeting: '#7c9fff', Work: '#f5a623', Personal: '#4fd1a5', Reminder: '#e879f9',
  'Project deadline': '#ff6b6b', 'Task due': '#7ee787', Subscription: '#c9a3ff',
}
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

const pad2 = n => String(n).padStart(2, '0')
const monthLabel = iso => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
const dayLabel = iso => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
const timeLabel = t => { // 'HH:MM:SS' -> '9:00 AM'
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${pad2(m)} ${ampm}`
}

function Dot({ color }) {
  return <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block' }} />
}

function AgendaRow({ item, conflicted, onDelete }) {
  const color = CAT_COLOR[item.category] || '#7c9fff'
  return (
    <div className="item" style={{ borderLeft: `3px solid ${color}`, opacity: item.done ? 0.5 : 1 }}>
      <div style={{ flex: 1 }}>
        <div className="item-title" style={{ textDecoration: item.done ? 'line-through' : 'none' }}>
          {item.title} {conflicted && <span title="Overlaps another event" style={{ color: 'var(--danger, #ff6b6b)' }}>⚠</span>}
        </div>
        <div className="item-sub">
          {item.allDay ? 'All day' : `${timeLabel(item.time)}${item.endTime ? ` – ${timeLabel(item.endTime)}` : ''}`}
          {item.location ? ` · ${item.location}` : ''} · {item.category}
        </div>
      </div>
      {item.kind === 'event' && onDelete && (
        <button className="btn-ghost danger" onClick={() => onDelete(item)}>✕</button>
      )}
    </div>
  )
}

function AddEventForm({ uid, defaultDate, onDone, onCancel }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [allDay, setAllDay] = useState(false)
  const [time, setTime] = useState('09:00')
  const [endTime, setEndTime] = useState('')
  const [category, setCategory] = useState('Meeting')
  const [location, setLocation] = useState('')
  const [recurrence, setRecurrence] = useState('none')
  const [err, setErr] = useState('')

  useEffect(() => { ensureNotificationPermission() }, [])

  const save = async () => {
    if (!title.trim()) { setErr('Title is required.'); return }
    setErr('')
    const { error } = await supabase.from('calendar_events').insert({
      user_id: uid, title: title.trim(), event_date: date,
      event_time: allDay ? null : time, end_time: allDay ? null : (endTime || null),
      category, location: location.trim() || null, recurrence,
    })
    if (error) { setErr(error.message); return }
    resyncEventNotifications(uid)
    onDone()
  }

  return (
    <div className="panel">
      <span className="hud" style={{ marginBottom: '0.7rem', display: 'block' }}>NEW EVENT</span>
      <div className="grid">
        <input className="input" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
        <div className="row wrap">
          <input className="input" type="date" style={{ flex: 1, minWidth: 130 }} value={date} onChange={e => setDate(e.target.value)} />
          <select className="input" style={{ flex: 1, minWidth: 110 }} value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <label className="row" style={{ gap: '0.5rem' }}>
          <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} />
          <span className="item-sub">All day</span>
        </label>
        {!allDay && (
          <div className="row wrap">
            <input className="input" type="time" style={{ flex: 1, minWidth: 110 }} value={time} onChange={e => setTime(e.target.value)} />
            <input className="input" type="time" style={{ flex: 1, minWidth: 110 }} placeholder="End (optional)" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
        )}
        <div className="row wrap">
          <input className="input" placeholder="Location (optional)" style={{ flex: 1, minWidth: 130 }} value={location} onChange={e => setLocation(e.target.value)} />
          <select className="input" style={{ flex: 1, minWidth: 130 }} value={recurrence} onChange={e => setRecurrence(e.target.value)}>
            <option value="none">Doesn't repeat</option>
            <option value="weekly">Repeats weekly</option>
            <option value="monthly">Repeats monthly</option>
          </select>
        </div>
      </div>
      {err && <div className="auth-err">{err}</div>}
      <div className="row" style={{ gap: '0.5rem', marginTop: '0.7rem' }}>
        <button className="btn-sm" onClick={save}>Save</button>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function MonthView({ monthIso, data, onSelectDay }) {
  const first = new Date(monthIso + 'T00:00:00')
  first.setDate(1)
  const gridStart = new Date(first)
  gridStart.setDate(gridStart.getDate() - first.getDay())
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(d.getDate() + i)
    return isoDate(d)
  })
  const thisMonth = first.getMonth()
  const t = today()

  return (
    <div className="panel">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.3rem', marginBottom: '0.4rem' }}>
        {WEEKDAYS.map((w, i) => <div key={i} className="item-sub" style={{ textAlign: 'center' }}>{w}</div>)}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.3rem' }}>
        {cells.map(dateIso => {
          const d = new Date(dateIso + 'T00:00:00')
          const inMonth = d.getMonth() === thisMonth
          const items = dayItems(dateIso, data)
          const cats = [...new Set(items.map(i => i.category))].slice(0, 4)
          return (
            <button key={dateIso} onClick={() => onSelectDay(dateIso)} className="btn-ghost" style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
              padding: '0.5rem 0.2rem', minHeight: 52, opacity: inMonth ? 1 : 0.35,
              border: dateIso === t ? '1px solid var(--accent, #7c9fff)' : '1px solid transparent',
              borderRadius: 8,
            }}>
              <span>{d.getDate()}</span>
              <span className="row" style={{ gap: 3 }}>
                {cats.map(c => <Dot key={c} color={CAT_COLOR[c] || '#7c9fff'} />)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ weekStartIso, data, onSelectDay, onDeleteEvent }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartIso, i))
  const t = today()
  return (
    <div className="grid">
      {days.map(dateIso => {
        const items = dayItems(dateIso, data)
        const conflicts = conflictIds(items)
        return (
          <div key={dateIso} className="panel" style={{ padding: '0.7rem 0.9rem' }}>
            <button className="btn-ghost" onClick={() => onSelectDay(dateIso)} style={{ padding: 0, marginBottom: '0.4rem' }}>
              <span className="item-title" style={{ color: dateIso === t ? 'var(--accent, #7c9fff)' : undefined }}>
                {dayLabel(dateIso)}
              </span>
            </button>
            {items.length === 0
              ? <div className="empty">Nothing scheduled.</div>
              : items.map(i => <AgendaRow key={`${i.kind}-${i.id}`} item={i} conflicted={conflicts.has(i.id)} onDelete={onDeleteEvent} />)}
          </div>
        )
      })}
    </div>
  )
}

function DayView({ dateIso, data, onDeleteEvent }) {
  const items = dayItems(dateIso, data)
  const conflicts = conflictIds(items)
  const allDayItems = items.filter(i => i.allDay)
  const timed = items.filter(i => !i.allDay)

  return (
    <div className="panel">
      <span className="item-title" style={{ display: 'block', marginBottom: '0.7rem' }}>{dayLabel(dateIso)}</span>
      {allDayItems.length > 0 && (
        <div className="list" style={{ marginBottom: '0.8rem' }}>
          {allDayItems.map(i => <AgendaRow key={`${i.kind}-${i.id}`} item={i} conflicted={conflicts.has(i.id)} onDelete={onDeleteEvent} />)}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        {HOURS.map(h => {
          const hourItems = timed.filter(i => Math.floor((minutesOf(i.time) ?? 0) / 60) === h)
          return (
            <div key={h} className="row" style={{ borderTop: '1px solid var(--line)', minHeight: 48, alignItems: 'flex-start', gap: '0.6rem' }}>
              <span className="item-sub" style={{ width: 54, flexShrink: 0, paddingTop: '0.3rem' }}>
                {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
              </span>
              <div style={{ flex: 1, padding: '0.2rem 0' }}>
                {hourItems.map(i => <AgendaRow key={`${i.kind}-${i.id}`} item={i} conflicted={conflicts.has(i.id)} onDelete={onDeleteEvent} />)}
              </div>
            </div>
          )
        })}
      </div>
      {items.length === 0 && <div className="empty">Nothing scheduled today.</div>}
    </div>
  )
}

export default function Calendar() {
  const [uid, setUid] = useState(null)
  const [view, setView] = useState('month')
  const [cursor, setCursor] = useState(today()) // anchor date for whichever view is active
  const [showAdd, setShowAdd] = useState(false)
  const data = useCalendarData(uid)

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data.user?.id)) }, [])

  const monthIso = cursor.slice(0, 8) + '01'
  const weekStartIso = startOfWeek(cursor)

  const shift = dir => {
    if (view === 'month') { const d = new Date(monthIso + 'T00:00:00'); d.setMonth(d.getMonth() + dir); setCursor(isoDate(d)) }
    else if (view === 'week') setCursor(addDays(cursor, dir * 7))
    else setCursor(addDays(cursor, dir))
  }

  const deleteEvent = async item => {
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    await supabase.from('calendar_events').delete().eq('id', item.id)
    resyncEventNotifications(uid)
    data.reload()
  }

  const heading = view === 'month' ? monthLabel(monthIso) : view === 'week' ? `Week of ${dayLabel(weekStartIso)}` : dayLabel(cursor)

  if (!uid) return null

  return (
    <div className="calendar-page calendar-white">
      <div className="section-head">
        <h2 className="display">CALENDAR</h2>
        <span className="hud">08 — TIME · LIVE</span>
      </div>

      <div className="tabs" style={{ marginBottom: '0.8rem' }}>
        {['month', 'week', 'day'].map(v => (
          <button key={v} className={`tab ${view === v ? 'on' : ''}`} onClick={() => setView(v)}>{v.toUpperCase()}</button>
        ))}
      </div>

      <div className="row between" style={{ marginBottom: '0.8rem' }}>
        <button className="btn-ghost" onClick={() => shift(-1)}>← Prev</button>
        <span className="item-title">{heading}</span>
        <button className="btn-ghost" onClick={() => shift(1)}>Next →</button>
      </div>

      {showAdd ? (
        <AddEventForm uid={uid} defaultDate={cursor} onDone={() => { setShowAdd(false); data.reload() }} onCancel={() => setShowAdd(false)} />
      ) : (
        <button className="btn-sm" style={{ marginBottom: '0.8rem' }} onClick={() => setShowAdd(true)}>+ Add event</button>
      )}

      {view === 'month' && <MonthView monthIso={monthIso} data={data} onSelectDay={d => { setCursor(d); setView('day') }} />}
      {view === 'week' && <WeekView weekStartIso={weekStartIso} data={data} onSelectDay={d => { setCursor(d); setView('day') }} onDeleteEvent={deleteEvent} />}
      {view === 'day' && <DayView dateIso={cursor} data={data} onDeleteEvent={deleteEvent} />}
    </div>
  )
}
