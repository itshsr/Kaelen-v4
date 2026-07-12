import { useEffect, useState } from 'react'
import { supabase } from './supabase'

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
