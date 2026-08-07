import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { scheduleNotification, cancelNotifications, notificationId } from './notifications'

export const pad2 = n => String(n).padStart(2, '0')
export const isoDate = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
export const today = () => isoDate(new Date())
export const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d) }
export const startOfWeek = iso => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - d.getDay()); return isoDate(d) }
export const minutesOf = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m }

// Does a manual calendar_event occur on `dateIso`, accounting for recurrence?
export function occursOn(ev, dateIso) {
  if (dateIso < ev.event_date) return false
  if (ev.recurrence === 'none') return ev.event_date === dateIso
  const start = new Date(ev.event_date + 'T00:00:00')
  const d = new Date(dateIso + 'T00:00:00')
  if (ev.recurrence === 'weekly') return start.getDay() === d.getDay()
  if (ev.recurrence === 'monthly') return start.getDate() === d.getDate()
  return false
}

export function useCalendarData(uid) {
  const [events, setEvents] = useState([])
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [subs, setSubs] = useState([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!uid) return
    Promise.all([
      supabase.from('calendar_events').select('*').order('event_date'),
      supabase.from('projects').select('id,name,deadline').not('deadline', 'is', null),
      supabase.from('tasks').select('id,title,due_date,completed').not('due_date', 'is', null),
      supabase.from('subscriptions').select('id,name,billing_day,amount').not('billing_day', 'is', null),
    ]).then(([e, p, t, s]) => {
      setEvents(e.data || []); setProjects(p.data || []); setTasks(t.data || []); setSubs(s.data || [])
    })
  }, [uid, tick])

  return { events, projects, tasks, subs, reload: () => setTick(x => x + 1) }
}

// Unified, sorted agenda for one date — timed items first (by time), then all-day items.
export function dayItems(dateIso, data) {
  const dayNum = Number(dateIso.split('-')[2])
  const items = []
  data.events.filter(e => occursOn(e, dateIso)).forEach(e => items.push({
    kind: 'event', id: e.id, title: e.title, time: e.event_time, endTime: e.end_time,
    category: e.category, location: e.location, allDay: !e.event_time,
  }))
  data.projects.filter(p => p.deadline === dateIso).forEach(p => items.push({
    kind: 'project', id: p.id, title: `${p.name} — deadline`, category: 'Project deadline', allDay: true,
  }))
  data.tasks.filter(t => t.due_date === dateIso).forEach(t => items.push({
    kind: 'task', id: t.id, title: t.title, category: 'Task due', allDay: true, done: t.completed,
  }))
  data.subs.filter(s => s.billing_day === dayNum).forEach(s => items.push({
    kind: 'sub', id: s.id, title: `${s.name} — ₹${s.amount}`, category: 'Subscription', allDay: true,
  }))
  return items.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? 1 : -1
    return (minutesOf(a.time) ?? 0) - (minutesOf(b.time) ?? 0)
  })
}

// Flags timed events (kind 'event' only) whose [time, endTime) ranges overlap.
export function conflictIds(items) {
  const timed = items.filter(i => i.kind === 'event' && i.time)
  const bad = new Set()
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const aStart = minutesOf(timed[i].time), aEnd = minutesOf(timed[i].endTime) ?? aStart + 30
      const bStart = minutesOf(timed[j].time), bEnd = minutesOf(timed[j].endTime) ?? bStart + 30
      if (aStart < bEnd && bStart < aEnd) { bad.add(timed[i].id); bad.add(timed[j].id) }
    }
  }
  return bad
}

// Next future occurrence of a manual event (accounting for recurrence) as a
// JS Date, or null if it has none coming up in the next ~60 days.
function nextOccurrenceDate(ev) {
  if (!ev.event_time) return null
  for (let i = 0; i < 60; i++) {
    const dateIso = addDays(today(), i)
    if (!occursOn(ev, dateIso)) continue
    const dt = new Date(`${dateIso}T${ev.event_time}`)
    if (dt.getTime() > Date.now()) return dt
  }
  return null
}

// Re-schedules native reminder notifications (30 min before each timed
// event's next occurrence) to match current data. Cancels everything it
// scheduled last time first, so deleted/changed events don't leave stale
// notifications behind. No-ops on web. Safe to call often — on app load and
// after adding an event.
export async function resyncEventNotifications(uid) {
  if (!uid) return
  const { data: events } = await supabase.from('calendar_events').select('*').eq('user_id', uid).not('event_time', 'is', null)
  const storageKey = `kaelen-notif-ids-${uid}` // scoped per account — shared devices with multiple
                                                 // KAELEN users must not cancel/overwrite each other's reminders
  let prevIds = []
  try { prevIds = JSON.parse(localStorage.getItem(storageKey) || '[]') } catch { /* ignore */ }
  await cancelNotifications(prevIds)

  const newIds = []
  for (const ev of events || []) {
    const occ = nextOccurrenceDate(ev)
    if (!occ) continue
    const remindAt = new Date(occ.getTime() - 30 * 60000)
    const id = notificationId(ev.id)
    await scheduleNotification({
      id, title: `Upcoming: ${ev.title}`,
      body: `${ev.category} at ${occ.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${ev.location ? ' · ' + ev.location : ''}`,
      at: remindAt,
    })
    newIds.push(id)
  }
  try { localStorage.setItem(storageKey, JSON.stringify(newIds)) } catch { /* ignore */ }
}
