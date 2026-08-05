import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useHabits } from '../lib/useHabits'
import { useCalendarData, dayItems, today as todayIso } from '../lib/calendarData'
import SpotifyCard from '../components/SpotifyCard'

const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

export default function Home({ profileName }) {
  const [uid, setUid] = useState(null)
  const [now, setNow] = useState(new Date())
  const [budget, setBudget] = useState({ cap: 0, spent: 0 })
  const [focusToday, setFocusToday] = useState(0)
  const habitsApi = useHabits(uid)
  const calData = useCalendarData(uid)

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data.user?.id)) }, [])
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!uid) return
    const today = new Date().toISOString().slice(0, 10)
    Promise.all([
      supabase.from('budget_settings').select('monthly_cap').eq('user_id', uid).single(),
      supabase.from('expenses').select('amount').gte('spent_on', monthStart()),
      supabase.from('focus_sessions').select('id', { count: 'exact', head: true }).eq('session_date', today).eq('completed', true),
    ]).then(([b, x, f]) => {
      setBudget({
        cap: Number(b.data?.monthly_cap || 0),
        spent: (x.data || []).reduce((s, e) => s + Number(e.amount), 0),
      })
      setFocusToday(f.count || 0)
    })
  }, [uid])

  const hour = now.getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  const pct = budget.cap > 0 ? Math.min((budget.spent / budget.cap) * 100, 100) : 0
  const over = budget.cap > 0 && budget.spent > budget.cap
  const { habits, doneToday, streaks, toggle } = habitsApi
  const todayAgenda = uid ? dayItems(todayIso(), calData) : []

  return (
    <>
      <div className="hero-tile">
        <div style={{ position: 'relative', zIndex: 2, padding: '1.8rem 1.5rem', display: 'grid', gap: '0.3rem' }}>
          <span className="hud">01 — ORIGIN · {timeStr}</span>
          <h2 className="display" style={{ fontSize: '1.7rem' }}>{greet}{profileName ? `, ${profileName}` : ''}</h2>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{dateStr}</span>
        </div>
      </div>

      <div className="grid cols2">
        <div className="panel" style={{ gridColumn: '1 / -1' }}>
          <div className="row between" style={{ marginBottom: '0.7rem' }}>
            <span className="hud">TODAY'S AGENDA</span>
            <Link to="/calendar" className="btn-ghost" style={{ textDecoration: 'none' }}>Open calendar →</Link>
          </div>
          {todayAgenda.length === 0 ? (
            <div className="empty">Nothing scheduled today.</div>
          ) : (
            <div className="list">
              {todayAgenda.map(i => (
                <div className="item" key={`${i.kind}-${i.id}`}>
                  <div style={{ flex: 1 }}>
                    <div className="item-title" style={{ textDecoration: i.done ? 'line-through' : 'none' }}>{i.title}</div>
                    <div className="item-sub">{i.allDay ? 'All day' : i.time?.slice(0, 5)} · {i.category}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="row between" style={{ marginBottom: '0.7rem' }}>
            <span className="hud">HABITS TODAY</span>
            <span className="pill">{doneToday.size} / {habits.length || 0}</span>
          </div>
          {habits.length === 0 ? (
            <div className="empty">Add habits in GRIMOIRE.</div>
          ) : (
            <div className="ring-row">
              {habits.map(h => {
                const done = doneToday.has(h.id)
                const r = 26, c = 2 * Math.PI * r
                return (
                  <div key={h.id} style={{ cursor: 'pointer' }} onClick={() => toggle(h.id)}>
                    <div className="ring">
                      <svg width="62" height="62">
                        <circle cx="31" cy="31" r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
                        <circle cx="31" cy="31" r={r} fill="none" stroke={done ? 'var(--accent)' : 'transparent'}
                          strokeWidth="4" strokeDasharray={c} strokeDashoffset={done ? 0 : c} strokeLinecap="round"
                          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
                      </svg>
                      <span className="ring-lbl">{done ? '✓' : streaks[h.id] || 0}</span>
                    </div>
                    <div className="ring-name">{h.name}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="row between" style={{ marginBottom: '0.7rem' }}>
            <span className="hud">FOCUS</span>
            <span className="pill accent">{focusToday} TODAY</span>
          </div>
          <div className="stat" style={{ marginBottom: '0.9rem' }}>
            <span className="num">{focusToday}</span>
            <span className="lbl">Sessions completed today</span>
          </div>
          <Link to="/forge" className="btn-ghost" style={{ textDecoration: 'none', display: 'inline-block' }}>Open focus timer →</Link>
        </div>

        <div className="panel" style={{ gridColumn: '1 / -1' }}>
          <div className="row between" style={{ marginBottom: '0.7rem' }}>
            <span className="hud">VAULT · THIS MONTH</span>
            <span className="pill">{budget.cap > 0 ? `${Math.round(pct)}%` : 'NO CAP'}</span>
          </div>
          <div className="row between wrap" style={{ marginBottom: '0.6rem' }}>
            <div className="stat">
              <span className="num" style={over ? { color: 'var(--danger, #ff6b6b)' } : { color: 'var(--accent, #7c9fff)' }}>
                {budget.cap > 0 ? (over ? inr(budget.spent - budget.cap) : inr(Math.max(budget.cap - budget.spent, 0))) : inr(budget.spent)}
              </span>
              <span className="lbl">{budget.cap > 0 ? (over ? 'Over cap by' : 'Left this month') : 'Spent'}</span>
            </div>
            <div className="stat" style={{ textAlign: 'right' }}>
              <span className="hud">{inr(budget.spent)} spent of {budget.cap > 0 ? inr(budget.cap) : '—'}</span>
            </div>
          </div>
          <div className={`progress ${over ? 'over' : ''}`}><div style={{ width: `${pct}%` }} /></div>
          {budget.cap > 0 && (
            <div className="hud" style={{ marginTop: '0.5rem' }}>
              {Math.round(pct)}% OF CAP USED
            </div>
          )}
        </div>

        <SpotifyCard />

        <div className="panel" style={{ gridColumn: '1 / -1' }}>
          <span className="hud" style={{ display: 'block', marginBottom: '0.7rem' }}>QUICK ACTIONS</span>
          <div className="quick">
            <Link to="/forge">START FOCUS</Link>
            <Link to="/grimoire">LOG HABIT</Link>
            <Link to="/vault">LOG EXPENSE</Link>
            <Link to="/calendar">ADD EVENT</Link>
          </div>
        </div>
      </div>
    </>
  )
}
