import { useState } from 'react'
import { useSupabaseTable } from '../../lib/useSupabaseTable'
import { useConfirm } from '../../lib/ConfirmContext'
import { parseSubLines } from '../../lib/importHelpers'
import { inr } from './shared'
import SimpleImport from './SimpleImport'

export default function Subs({ uid, cards }) {
  const confirm = useConfirm()
  const { rows: subs, err, insert, update, remove } = useSupabaseTable('subscriptions', {
    orderBy: { column: 'created_at', ascending: false },
    enabled: !!uid,
  })
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [billingDay, setBillingDay] = useState('')

  const add = async () => {
    if (!name.trim()) return
    const isCard = method && method !== 'UPI' && method !== 'Cash'
    await insert({
      user_id: uid, name: name.trim(), amount: parseFloat(amount) || 0,
      card_id: isCard ? method : null,
      payment_method: isCard ? null : (method || null),
      billing_day: billingDay ? Number(billingDay) : null,
    })
    setName(''); setAmount(''); setBillingDay('')
  }
  const setPaid = (s, paid) => update(s.id, { paid_this_month: paid })
  const togglePause = s => update(s.id, { status: s.status === 'active' ? 'paused' : 'active' })
  const del = async id => {
    if (!(await confirm('Delete this subscription? This cannot be undone.'))) return
    remove(id)
  }
  const cardLabel = id => cards.find(c => c.id === id)?.label || 'Card'
  const payLabel = s => s.card_id ? cardLabel(s.card_id) : (s.payment_method || 'No card')
  const [showImport, setShowImport] = useState(false)

  if (showImport) {
    return <SimpleImport title="IMPORT SUBSCRIPTIONS" uid={uid} table="subscriptions"
      rowFields={[
        { key: 'name', label: 'Name column', candidates: ['name', 'subscription'], required: true },
        { key: 'amount', label: 'Amount column', candidates: ['amount', 'price', 'cost'], numeric: true },
      ]}
      parseLines={parseSubLines}
      extraFields="ONE PER LINE: NAME, AMOUNT"
      buildPayload={(r, uid2) => ({ user_id: uid2, name: r.name, amount: r.amount || 0 })}
      onClose={() => setShowImport(false)}
      onDone={() => setShowImport(false)}
    />
  }

  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: '0.7rem' }}>
        <span className="hud">SUBSCRIPTIONS</span>
        <button className="btn-ghost" onClick={() => setShowImport(true)}>Import</button>
      </div>
      <div className="row wrap" style={{ marginBottom: '0.9rem' }}>
        <input className="input" placeholder="Subscription name" style={{ flex: 2, minWidth: 140 }} value={name} onChange={e => setName(e.target.value)} />
        <input className="input" type="number" placeholder="₹/month" style={{ flex: 1, minWidth: 100 }} value={amount} onChange={e => setAmount(e.target.value)} />
        <input className="input" type="number" min="1" max="31" placeholder="Billing day" style={{ flex: 1, minWidth: 100 }} value={billingDay} onChange={e => setBillingDay(e.target.value)} title="Day of month it bills (optional) — shows on your Calendar" />
        <select className="input" style={{ flex: 1, minWidth: 110 }} value={method} onChange={e => setMethod(e.target.value)}>
          <option value="">No card</option>
          <option value="Cash">Cash</option>
          <option value="UPI">UPI</option>
          {cards.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button className="btn-sm" onClick={add}>Add</button>
      </div>
      {err && <div className="auth-err">{err}</div>}
      <div className="list">
        {subs.length === 0 && <div className="empty">No subscriptions tracked.</div>}
        {subs.map(s => (
          <div className="item" key={s.id}>
            <div style={{ flex: 1 }}>
              <div className="item-title" style={s.status === 'paused' ? { color: 'var(--text-dim)' } : {}}>
                {s.name} · {inr(s.amount)}
              </div>
              <div className="item-sub">
                {s.status === 'paused' ? 'Paused' : s.paid_this_month ? 'Paid this month' : 'Unpaid'} · {payLabel(s)}{s.billing_day ? ` · Bills on ${s.billing_day}${['th', 'st', 'nd', 'rd'][(s.billing_day % 10 > 3 || [11, 12, 13].includes(s.billing_day % 100)) ? 0 : s.billing_day % 10]}` : ''}
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
