import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const DEFAULT_CATS = ['Food', 'Transport', 'Shopping', 'Bills', 'Health', 'Other']
const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

function useUid() {
  const [uid, setUid] = useState(null)
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data.user?.id)) }, [])
  return uid
}

function Expenses({ uid, cards, reload }) {
  const [expenses, setExpenses] = useState([])
  const [amount, setAmount] = useState('')
  const [cat, setCat] = useState('Food')
  const [customCat, setCustomCat] = useState('')
  const [note, setNote] = useState('')
  const [method, setMethod] = useState('Cash')
  const [err, setErr] = useState('')

  const load = async () => {
    const { data } = await supabase.from('expenses').select('*')
      .gte('spent_on', monthStart()).order('created_at', { ascending: false })
    setExpenses(data || [])
  }
  useEffect(() => { if (uid) load() }, [uid, reload])

  const add = async () => {
    setErr('')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    const category = cat === '__custom' ? (customCat.trim() || 'Other') : cat
    const isCard = method !== 'Cash' && method !== 'UPI'
    const { error } = await supabase.from('expenses').insert({
      user_id: uid, amount: amt, category, note: note.trim() || null,
      payment_method: isCard ? 'Card' : method,
      card_id: isCard ? method : null,
    })
    if (error) { setErr(error.message); return }
    setAmount(''); setNote(''); setCustomCat(''); load()
  }
  const del = async id => {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) { setErr(error.message); return }
    load()
  }
  const cardLabel = id => cards.find(c => c.id === id)?.label || 'Card'

  return (
    <div className="panel">
      <div className="grid" style={{ marginBottom: '0.9rem' }}>
        <div className="row wrap">
          <input className="input" type="number" min="0" step="0.01" placeholder="Amount (₹)" style={{ flex: 1, minWidth: 110 }}
            value={amount} onChange={e => setAmount(e.target.value)} />
          <select className="input" style={{ flex: 1, minWidth: 110 }} value={cat} onChange={e => setCat(e.target.value)}>
            {DEFAULT_CATS.map(c => <option key={c}>{c}</option>)}
            <option value="__custom">Custom…</option>
          </select>
          {cat === '__custom' && (
            <input className="input" placeholder="Category name" style={{ flex: 1, minWidth: 110 }}
              value={customCat} onChange={e => setCustomCat(e.target.value)} />
          )}
        </div>
        <div className="row wrap">
          <select className="input" style={{ flex: 1, minWidth: 110 }} value={method} onChange={e => setMethod(e.target.value)}>
            <option>Cash</option>
            <option value="UPI">UPI</option>
            {cards.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input className="input" placeholder="Note (optional)" style={{ flex: 2, minWidth: 130 }}
            value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <button className="btn-sm" onClick={add}>Log</button>
        </div>
      </div>
      {err && <div className="auth-err">{err}</div>}
      <div className="list">
        {expenses.length === 0 && <div className="empty">No expenses this month.</div>}
        {expenses.map(x => (
          <div className="item" key={x.id}>
            <div style={{ flex: 1 }}>
              <div className="item-title">{inr(x.amount)} · {x.category}</div>
              <div className="item-sub">
                {x.spent_on} · {x.card_id ? cardLabel(x.card_id) : (x.payment_method || 'Cash')}{x.note ? ` · ${x.note}` : ''}
              </div>
            </div>
            <button className="btn-ghost danger" onClick={() => del(x.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Budget({ uid, reload }) {
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
        <div className="stat"><span className="num">{inr(spent)}</span><span className="lbl">Spent this month</span></div>
        <div className="stat" style={{ textAlign: 'right' }}>
          {editing ? (
            <div className="row">
              <input className="input" type="number" style={{ width: 120 }} value={draft} onChange={e => setDraft(e.target.value)} />
              <button className="btn-sm" onClick={save}>Save</button>
            </div>
          ) : (
            <>
              <span className="num">{cap > 0 ? inr(cap) : '—'}</span>
              <span className="lbl">Monthly cap · <button className="btn-ghost" style={{ padding: '0 0.3rem' }} onClick={() => { setDraft(String(cap || '')); setEditing(true) }}>edit</button></span>
            </>
          )}
        </div>
      </div>
      <div className={`progress ${over ? 'over' : ''}`}><div style={{ width: `${pct}%` }} /></div>
      <div className="hud" style={{ marginTop: '0.5rem' }}>
        {cap > 0
          ? (over ? `OVER CAP BY ${inr(spent - cap)}` : `${inr(Math.max(cap - spent, 0))} LEFT · ${Math.round(pct)}% OF CAP USED`)
          : 'SET A MONTHLY CAP'}
      </div>
    </div>
  )
}

function Cards({ uid, cards, spentByCard, onChange }) {
  const [label, setLabel] = useState('')
  const [limit, setLimit] = useState('')

  const add = async () => {
    if (!label.trim()) return
    await supabase.from('credit_cards').insert({ user_id: uid, label: label.trim(), credit_limit: parseFloat(limit) || 0 })
    setLabel(''); setLimit(''); onChange()
  }
  const del = async id => { await supabase.from('credit_cards').delete().eq('id', id); onChange() }

  return (
    <div className="panel">
      <div className="row wrap" style={{ marginBottom: '0.9rem' }}>
        <input className="input" placeholder="Card name" style={{ flex: 2, minWidth: 130 }} value={label} onChange={e => setLabel(e.target.value)} />
        <input className="input" type="number" placeholder="Limit (₹)" style={{ flex: 1, minWidth: 110 }} value={limit} onChange={e => setLimit(e.target.value)} />
        <button className="btn-sm" onClick={add}>Add card</button>
      </div>
      <div className="list">
        {cards.length === 0 && <div className="empty">No cards added.</div>}
        {cards.map(c => {
          const spent = spentByCard[c.id] || 0
          const lim = Number(c.credit_limit)
          const pct = lim > 0 ? Math.min((spent / lim) * 100, 100) : 0
          return (
            <div className="item" key={c.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
              <div className="row between">
                <span className="item-title" style={{ fontWeight: 600 }}>{c.label}</span>
                <button className="btn-ghost danger" onClick={() => del(c.id)}>✕</button>
              </div>
              <div className="progress"><div style={{ width: `${pct}%` }} /></div>
              <div className="item-sub">
                {inr(spent)} spent · {lim > 0 ? `${inr(Math.max(lim - spent, 0))} available of ${inr(lim)}` : 'no limit set'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Subs({ uid, cards }) {
  const [subs, setSubs] = useState([])
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')

  const load = async () => {
    const { data } = await supabase.from('subscriptions').select('*').order('created_at', { ascending: false })
    setSubs(data || [])
  }
  useEffect(() => { if (uid) load() }, [uid])

  const add = async () => {
    if (!name.trim()) return
    const isCard = method && method !== 'UPI' && method !== 'Cash'
    await supabase.from('subscriptions').insert({
      user_id: uid, name: name.trim(), amount: parseFloat(amount) || 0,
      card_id: isCard ? method : null,
      payment_method: isCard ? null : (method || null),
    })
    setName(''); setAmount(''); load()
  }
  const setPaid = async (s, paid) => { await supabase.from('subscriptions').update({ paid_this_month: paid }).eq('id', s.id); load() }
  const togglePause = async s => {
    await supabase.from('subscriptions').update({ status: s.status === 'active' ? 'paused' : 'active' }).eq('id', s.id); load()
  }
  const del = async id => { await supabase.from('subscriptions').delete().eq('id', id); load() }
  const cardLabel = id => cards.find(c => c.id === id)?.label || 'Card'
  const payLabel = s => s.card_id ? cardLabel(s.card_id) : (s.payment_method || 'No card')

  return (
    <div className="panel">
      <div className="row wrap" style={{ marginBottom: '0.9rem' }}>
        <input className="input" placeholder="Subscription name" style={{ flex: 2, minWidth: 140 }} value={name} onChange={e => setName(e.target.value)} />
        <input className="input" type="number" placeholder="₹/month" style={{ flex: 1, minWidth: 100 }} value={amount} onChange={e => setAmount(e.target.value)} />
        <select className="input" style={{ flex: 1, minWidth: 110 }} value={method} onChange={e => setMethod(e.target.value)}>
          <option value="">No card</option>
          <option value="Cash">Cash</option>
          <option value="UPI">UPI</option>
          {cards.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button className="btn-sm" onClick={add}>Add</button>
      </div>
      <div className="list">
        {subs.length === 0 && <div className="empty">No subscriptions tracked.</div>}
        {subs.map(s => (
          <div className="item" key={s.id}>
            <div style={{ flex: 1 }}>
              <div className="item-title" style={s.status === 'paused' ? { color: 'var(--text-dim)' } : {}}>
                {s.name} · {inr(s.amount)}
              </div>
              <div className="item-sub">
                {s.status === 'paused' ? 'Paused' : s.paid_this_month ? 'Paid this month' : 'Unpaid'} · {payLabel(s)}
              </div>
            </div>
            {s.status === 'active' && (
              <button className={`check ${s.paid_this_month ? 'on' : ''}`} title="Mark paid"
                onClick={() => setPaid(s, !s.paid_this_month)}>{s.paid_this_month ? '✓' : ''}</button>
            )}
            <button className="btn-ghost" onClick={() => togglePause(s)}>{s.status === 'active' ? 'Pause' : 'Resume'}</button>
            <button className="btn-ghost danger" onClick={() => del(s.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Vault() {
  const uid = useUid()
  const [tab, setTab] = useState('expenses')
  const [cards, setCards] = useState([])
  const [spentByCard, setSpentByCard] = useState({})
  const [reload, setReload] = useState(0)

  const loadCards = async () => {
    const [{ data: c }, { data: x }] = await Promise.all([
      supabase.from('credit_cards').select('*').order('created_at'),
      supabase.from('expenses').select('card_id,amount').not('card_id', 'is', null),
    ])
    setCards(c || [])
    const m = {}
    ;(x || []).forEach(e => { m[e.card_id] = (m[e.card_id] || 0) + Number(e.amount) })
    setSpentByCard(m)
  }
  useEffect(() => { if (uid) loadCards() }, [uid, reload])

  return (
    <>
      <div className="section-head">
        <h2 className="display">VAULT</h2>
        <span className="hud">06 — COIN · LIVE</span>
      </div>
      {uid && <Budget uid={uid} reload={reload} />}
      <div className="tabs" style={{ marginTop: '1rem' }}>
        {['expenses', 'cards', 'subscriptions'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t.toUpperCase()}</button>
        ))}
      </div>
      {uid && tab === 'expenses' && <Expenses uid={uid} cards={cards} reload={reload} />}
      {uid && tab === 'cards' && <Cards uid={uid} cards={cards} spentByCard={spentByCard} onChange={() => setReload(r => r + 1)} />}
      {uid && tab === 'subscriptions' && <Subs uid={uid} cards={cards} />}
      {tab === 'expenses' && <ReloadOnAdd setReload={setReload} />}
    </>
  )
}

// bump card totals when expenses change
function ReloadOnAdd({ setReload }) {
  useEffect(() => {
    const ch = supabase.channel('exp-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => setReload(r => r + 1))
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [setReload])
  return null
}
