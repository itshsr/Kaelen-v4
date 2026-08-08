import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { inr, monthStart } from './shared'

export default function Budget({ uid, reload }) {
  const [cap, setCap] = useState(0)
  const [spent, setSpent] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const load = async () => {
    const [{ data: b }, { data: x }] = await Promise.all([
      supabase.from('budget_settings').select('*').eq('user_id', uid).single(),
      supabase.from('expenses').select('amount').gte('spent_on', monthStart()),
    ])
    setCap(Number(b?.monthly_cap || 0))
    setSpent((x || []).reduce((s, e) => s + Number(e.amount), 0))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is recreated every render; adding it would re-run on every render instead of only when uid/reload change.
  useEffect(() => { if (uid) load() }, [uid, reload])

  const save = async () => {
    const v = parseFloat(draft)
    if (isNaN(v) || v < 0) return
    await supabase.from('budget_settings').update({ monthly_cap: v, updated_at: new Date().toISOString() }).eq('user_id', uid)
    setEditing(false); load()
  }

  const pct = cap > 0 ? Math.min((spent / cap) * 100, 100) : 0
  const over = cap > 0 && spent > cap

  return (
    <div className="panel">
      <div className="row between wrap" style={{ marginBottom: '0.7rem' }}>
        <div className="stat">
          <span className="num" style={over ? { color: 'var(--danger, #ff6b6b)' } : { color: 'var(--accent, #7c9fff)' }}>
            {cap > 0 ? (over ? inr(spent - cap) : inr(Math.max(cap - spent, 0))) : inr(spent)}
          </span>
          <span className="lbl">{cap > 0 ? (over ? 'Over cap by' : 'Left this month') : 'Spent this month'}</span>
        </div>
        <div className="stat" style={{ textAlign: 'right' }}>
          {editing ? (
            <div className="row">
              <input className="input" type="number" style={{ width: 120 }} value={draft} onChange={e => setDraft(e.target.value)} />
              <button className="btn-sm" onClick={save}>Save</button>
            </div>
          ) : (
            <>
              <span className="hud">{inr(spent)} spent of {cap > 0 ? inr(cap) : '—'}</span>
              <span className="lbl">Monthly cap · <button className="btn-ghost" style={{ padding: '0 0.3rem' }} onClick={() => { setDraft(String(cap || '')); setEditing(true) }}>edit</button></span>
            </>
          )}
        </div>
      </div>
      <div className={`progress ${over ? 'over' : ''}`}><div style={{ width: `${pct}%` }} /></div>
      <div className="hud" style={{ marginTop: '0.5rem' }}>
        {cap > 0
          ? `${Math.round(pct)}% OF CAP USED`
          : 'SET A MONTHLY CAP'}
      </div>
    </div>
  )
}
