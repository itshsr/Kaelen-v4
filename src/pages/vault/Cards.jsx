import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useConfirm } from '../../lib/ConfirmContext'
import { parseCardLines } from '../../lib/importHelpers'
import { inr } from './shared'
import SimpleImport from './SimpleImport'

function EditCardBalance({ c, onSave, onCancel }) {
  const [val, setVal] = useState(String(c.opening_balance || 0))
  const [err, setErr] = useState('')
  const save = () => {
    const v = parseFloat(val)
    if (isNaN(v) || v < 0) { setErr('Enter a valid amount'); return }
    onSave(v)
  }
  return (
    <div className="row wrap" style={{ gap: '0.5rem' }}>
      <input className="input" type="number" min="0" step="0.01" style={{ flex: 1, minWidth: 110 }}
        placeholder="Starting balance (₹)" value={val} onChange={e => setVal(e.target.value)} />
      <button className="btn-sm" onClick={save}>Save</button>
      <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      {err && <div className="auth-err">{err}</div>}
    </div>
  )
}

export default function Cards({ uid, cards, spentByCard, onChange }) {
  const confirm = useConfirm()
  const [label, setLabel] = useState('')
  const [limit, setLimit] = useState('')
  const [opening, setOpening] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [editingBalanceId, setEditingBalanceId] = useState(null)
  const [err, setErr] = useState('')

  const add = async () => {
    if (!label.trim()) return
    setErr('')
    const { error } = await supabase.from('credit_cards').insert({
      user_id: uid, label: label.trim(), credit_limit: parseFloat(limit) || 0,
      opening_balance: parseFloat(opening) || 0,
    })
    if (error) { setErr(error.message); return }
    setLabel(''); setLimit(''); setOpening(''); onChange()
  }
  const del = async id => {
    if (!(await confirm('Delete this card? This cannot be undone.'))) return
    setErr('')
    const { error } = await supabase.from('credit_cards').delete().eq('id', id)
    if (error) { setErr(error.message); return }
    onChange()
  }
  const saveBalance = async (id, opening_balance) => {
    setErr('')
    const { error } = await supabase.from('credit_cards').update({ opening_balance }).eq('id', id)
    if (error) { setErr(error.message); return }
    setEditingBalanceId(null); onChange()
  }

  if (showImport) {
    return <SimpleImport title="IMPORT CARDS" uid={uid} table="credit_cards"
      rowFields={[
        { key: 'label', label: 'Name column', candidates: ['name', 'label', 'card'], required: true },
        { key: 'credit_limit', label: 'Limit column', candidates: ['limit', 'credit limit'], numeric: true },
      ]}
      parseLines={parseCardLines}
      extraFields="ONE PER LINE: NAME, LIMIT"
      buildPayload={(r, uid2) => ({ user_id: uid2, label: r.label, credit_limit: r.credit_limit || 0 })}
      onClose={() => setShowImport(false)}
      onDone={() => { setShowImport(false); onChange() }}
    />
  }

  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: '0.7rem' }}>
        <span className="hud">CARDS</span>
        <button className="btn-ghost" onClick={() => setShowImport(true)}>Import</button>
      </div>
      <div className="row wrap" style={{ marginBottom: '0.9rem' }}>
        <input className="input" placeholder="Card name" style={{ flex: 2, minWidth: 130 }} value={label} onChange={e => setLabel(e.target.value)} />
        <input className="input" type="number" placeholder="Limit (₹)" style={{ flex: 1, minWidth: 110 }} value={limit} onChange={e => setLimit(e.target.value)} />
        <input className="input" type="number" placeholder="Starting balance (₹)" style={{ flex: 1, minWidth: 130 }} value={opening} onChange={e => setOpening(e.target.value)} />
        <button className="btn-sm" onClick={add}>Add card</button>
      </div>
      {err && <div className="auth-err">{err}</div>}
      <div className="list">
        {cards.length === 0 && <div className="empty">No cards added.</div>}
        {cards.map(c => {
          const opening_balance = Number(c.opening_balance || 0)
          const spent = (spentByCard[c.id] || 0) + opening_balance
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
              {editingBalanceId === c.id ? (
                <EditCardBalance c={c} onSave={v => saveBalance(c.id, v)} onCancel={() => setEditingBalanceId(null)} />
              ) : (
                <div className="row" style={{ gap: '0.5rem' }}>
                  <span className="item-sub">Starting balance: {inr(opening_balance)}</span>
                  <button className="btn-ghost" onClick={() => setEditingBalanceId(c.id)}>Edit</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
