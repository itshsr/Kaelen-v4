import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSupabaseTable } from '../lib/useSupabaseTable'
import PinGate from '../components/PinGate'
import {
  parseCsvFile, guessColumn, parseAmount, parseDate,
  DATE_CANDIDATES, AMOUNT_CANDIDATES, CREDIT_CANDIDATES, DESC_CANDIDATES,
  parseExpenseLines, parseCardLines, parseSubLines,
} from '../lib/importHelpers'

const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const DEFAULT_CATS = ['Food', 'Transport', 'Shopping', 'Bills', 'Health', 'Other']
const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

function useUid() {
  const [uid, setUid] = useState(null)
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data.user?.id)) }, [])
  return uid
}

function ImportExpenses({ uid, cards, onDone, onClose }) {
  const [mode, setMode] = useState('paste') // paste | csv
  const [pasteText, setPasteText] = useState('')
  const [file, setFile] = useState(null)
  const [headers, setHeaders] = useState([])
  const [csvRows, setCsvRows] = useState([])
  const [dateCol, setDateCol] = useState('')
  const [amountCol, setAmountCol] = useState('')
  const [creditCol, setCreditCol] = useState('')
  const [descCol, setDescCol] = useState('')
  const [skipCredits, setSkipCredits] = useState(true)
  const [method, setMethod] = useState('Cash')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const onPickFile = async e => {
    const f = e.target.files?.[0]
    if (!f) return
    setErr(''); setFile(f)
    try {
      const { headers: h, rows } = await parseCsvFile(f)
      setHeaders(h); setCsvRows(rows)
      setDateCol(guessColumn(h, DATE_CANDIDATES))
      setAmountCol(guessColumn(h, AMOUNT_CANDIDATES))
      setCreditCol(guessColumn(h, CREDIT_CANDIDATES))
      setDescCol(guessColumn(h, DESC_CANDIDATES))
    } catch (e2) { setErr('Could not read this file: ' + e2.message) }
  }

  const csvPreview = useMemo(() => {
    if (mode !== 'csv' || !amountCol) return { rows: [], skipped: 0, dateDefaulted: 0 }
    let skipped = 0
    let dateDefaulted = 0
    const rows = csvRows.map(r => {
      const debit = parseAmount(r[amountCol])
      const credit = creditCol ? parseAmount(r[creditCol]) : NaN
      const isCredit = !isNaN(credit) && credit > 0 && (isNaN(debit) || debit <= 0)
      const amount = isCredit ? credit : debit
      const rawDate = dateCol ? r[dateCol] : null
      const parsed = dateCol ? parseDate(rawDate) : null
      if (dateCol && rawDate && !parsed) dateDefaulted++
      return {
        amount, isCredit,
        spent_on: parsed || null,
        note: descCol ? String(r[descCol] || '').slice(0, 200) : null,
      }
    }).filter(r => {
      const ok = !isNaN(r.amount) && r.amount > 0
      if (!ok) skipped++
      return ok
    })
    return { rows, skipped, dateDefaulted }
  }, [mode, csvRows, amountCol, creditCol, dateCol, descCol])

  const pastePreview = useMemo(() => mode === 'paste' ? parseExpenseLines(pasteText) : { rows: [], skipped: 0 }, [mode, pasteText])

  const finalRows = mode === 'paste'
    ? pastePreview.rows
    : csvPreview.rows.filter(r => !skipCredits || !r.isCredit)
  const skippedCount = mode === 'paste' ? pastePreview.skipped : csvPreview.skipped
  const dateDefaultedCount = mode === 'csv' ? csvPreview.dateDefaulted : 0

  const isCard = method !== 'Cash' && method !== 'UPI'

  const doImport = async () => {
    if (finalRows.length === 0) return
    setBusy(true); setErr('')
    const payload = finalRows.map(r => ({
      user_id: uid,
      amount: r.amount,
      category: r.category || 'Other',
      note: r.note || null,
      spent_on: r.spent_on || new Date().toISOString().slice(0, 10),
      payment_method: isCard ? 'Card' : method,
      card_id: isCard ? method : null,
    }))
    const { error } = await supabase.from('expenses').insert(payload)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return (
    <div className="panel grid">
      <div className="row between">
        <span className="hud">IMPORT EXPENSES</span>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
      <div className="tabs" style={{ margin: 0 }}>
        <button className={`tab ${mode === 'paste' ? 'on' : ''}`} onClick={() => setMode('paste')}>PASTE LIST</button>
        <button className={`tab ${mode === 'csv' ? 'on' : ''}`} onClick={() => setMode('csv')}>UPLOAD CSV</button>
      </div>

      {mode === 'paste' && (
        <>
          <span className="hud">ONE PER LINE: AMOUNT, CATEGORY, NOTE</span>
          <textarea className="input" rows={6} placeholder={'450, Food, lunch\n1200, Transport'}
            value={pasteText} onChange={e => setPasteText(e.target.value)} />
        </>
      )}

      {mode === 'csv' && (
        <>
          <label className="btn-ghost" style={{ cursor: 'pointer', width: 'fit-content' }}>
            {file ? file.name : 'Choose CSV file'}
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={onPickFile} />
          </label>
          {headers.length > 0 && (
            <>
              <div className="grid cols2">
                <div className="field"><label className="hud">Date column</label>
                  <select className="input" value={dateCol} onChange={e => setDateCol(e.target.value)}>
                    <option value="">(none — use today)</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="field"><label className="hud">Amount / debit column</label>
                  <select className="input" value={amountCol} onChange={e => setAmountCol(e.target.value)}>
                    <option value="">— select —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="field"><label className="hud">Credit / deposit column</label>
                  <select className="input" value={creditCol} onChange={e => setCreditCol(e.target.value)}>
                    <option value="">(none)</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="field"><label className="hud">Description column</label>
                  <select className="input" value={descCol} onChange={e => setDescCol(e.target.value)}>
                    <option value="">(none)</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
              {creditCol && (
                <label className="row" style={{ fontSize: '0.85rem', gap: '0.5rem' }}>
                  <input type="checkbox" checked={skipCredits} onChange={e => setSkipCredits(e.target.checked)} />
                  Skip deposits/credits (only import spending)
                </label>
              )}
            </>
          )}
        </>
      )}

      {finalRows.length > 0 && (
        <>
          <span className="hud">{finalRows.length} ROWS READY \u00b7 PREVIEW FIRST 5</span>
          {(skippedCount > 0 || dateDefaultedCount > 0) && (
            <div className="auth-err" style={{ color: 'var(--warm)' }}>
              {skippedCount > 0 && `${skippedCount} row${skippedCount === 1 ? '' : 's'} skipped — no valid amount. `}
              {dateDefaultedCount > 0 && `${dateDefaultedCount} row${dateDefaultedCount === 1 ? '' : 's'} had an unreadable date — will import as today's date.`}
            </div>
          )}
          <div className="list">
            {finalRows.slice(0, 5).map((r, i) => (
              <div className="item" key={i}>
                <div className="item-title">{inr(r.amount)}{r.category ? ` \u00b7 ${r.category}` : ''}</div>
                <div className="item-sub">{r.spent_on || 'today'}{r.note ? ` \u00b7 ${r.note}` : ''}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="row wrap">
        <label className="hud">Import as</label>
        <select className="input" style={{ width: 'auto' }} value={method} onChange={e => setMethod(e.target.value)}>
          <option>Cash</option>
          <option value="UPI">UPI</option>
          {cards.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>

      {err && <div className="auth-err">{err}</div>}
      <button className="btn-sm" onClick={doImport} disabled={busy || finalRows.length === 0}>
        {busy ? 'Importing\u2026' : `Import ${finalRows.length || ''} expense${finalRows.length === 1 ? '' : 's'}`}
      </button>
    </div>
  )
}

function EditExpenseRow({ x, cards, onSave, onCancel }) {
  const isCardInit = x.card_id ? x.card_id : (x.payment_method === 'Cash' || x.payment_method === 'UPI' ? x.payment_method : 'Cash')
  const [amount, setAmount] = useState(String(x.amount))
  const [cat, setCat] = useState(DEFAULT_CATS.includes(x.category) ? x.category : '__custom')
  const [customCat, setCustomCat] = useState(DEFAULT_CATS.includes(x.category) ? '' : x.category)
  const [note, setNote] = useState(x.note || '')
  const [method, setMethod] = useState(isCardInit)
  const [spentOn, setSpentOn] = useState(x.spent_on || '')
  const [err, setErr] = useState('')

  const save = () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setErr('Enter a valid amount'); return }
    const category = cat === '__custom' ? (customCat.trim() || 'Other') : cat
    const isCard = method !== 'Cash' && method !== 'UPI'
    onSave({
      amount: amt, category, note: note.trim() || null, spent_on: spentOn,
      payment_method: isCard ? 'Card' : method,
      card_id: isCard ? method : null,
    })
  }

  return (
    <div className="item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
      <div className="row wrap">
        <input className="input" type="number" min="0" step="0.01" placeholder="Amount (₹)" style={{ flex: 1, minWidth: 100 }}
          value={amount} onChange={e => setAmount(e.target.value)} />
        <select className="input" style={{ flex: 1, minWidth: 100 }} value={cat} onChange={e => setCat(e.target.value)}>
          {DEFAULT_CATS.map(c => <option key={c}>{c}</option>)}
          <option value="__custom">Custom…</option>
        </select>
        {cat === '__custom' && (
          <input className="input" placeholder="Category name" style={{ flex: 1, minWidth: 100 }}
            value={customCat} onChange={e => setCustomCat(e.target.value)} />
        )}
      </div>
      <div className="row wrap">
        <input className="input" type="date" style={{ flex: 1, minWidth: 130 }} value={spentOn} onChange={e => setSpentOn(e.target.value)} />
        <select className="input" style={{ flex: 1, minWidth: 110 }} value={method} onChange={e => setMethod(e.target.value)}>
          <option>Cash</option>
          <option value="UPI">UPI</option>
          {cards.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <input className="input" placeholder="Note (optional)" style={{ flex: 2, minWidth: 130 }}
          value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} />
      </div>
      {err && <div className="auth-err">{err}</div>}
      <div className="row" style={{ gap: '0.5rem' }}>
        <button className="btn-sm" onClick={save}>Save</button>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function Expenses({ uid, cards, reload, onLogged }) {
  const [expenses, setExpenses] = useState([])
  const [amount, setAmount] = useState('')
  const [cat, setCat] = useState('Food')
  const [customCat, setCustomCat] = useState('')
  const [note, setNote] = useState('')
  const [method, setMethod] = useState('Cash')
  const [err, setErr] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [editingId, setEditingId] = useState(null)

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
    setAmount(''); setNote(''); setCustomCat(''); load(); onLogged?.()
  }
  const del = async id => {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) { setErr(error.message); return }
    load(); onLogged?.()
  }
  const saveEdit = async (id, payload) => {
    const { error } = await supabase.from('expenses').update(payload).eq('id', id)
    if (error) { setErr(error.message); return }
    setEditingId(null); load(); onLogged?.()
  }
  const cardLabel = id => cards.find(c => c.id === id)?.label || 'Card'

  if (showImport) {
    return <ImportExpenses uid={uid} cards={cards} onClose={() => setShowImport(false)}
      onDone={() => { setShowImport(false); load(); onLogged?.() }} />
  }

  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: '0.7rem' }}>
        <span className="hud">LOG EXPENSE</span>
        <button className="btn-ghost" onClick={() => setShowImport(true)}>Import</button>
      </div>
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
          editingId === x.id ? (
            <EditExpenseRow key={x.id} x={x} cards={cards}
              onSave={payload => saveEdit(x.id, payload)}
              onCancel={() => setEditingId(null)} />
          ) : (
            <div className="item" key={x.id}>
              <div style={{ flex: 1 }}>
                <div className="item-title">{inr(x.amount)} · {x.category}</div>
                <div className="item-sub">
                  {x.spent_on} · {x.card_id ? cardLabel(x.card_id) : (x.payment_method || 'Cash')}{x.note ? ` · ${x.note}` : ''}
                </div>
              </div>
              <button className="btn-ghost" onClick={() => setEditingId(x.id)}>Edit</button>
              <button className="btn-ghost danger" onClick={() => del(x.id)}>✕</button>
            </div>
          )
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

function SimpleImport({ title, uid, table, rowFields, parseLines, extraFields, buildPayload, onDone, onClose }) {
  const [mode, setMode] = useState('paste')
  const [pasteText, setPasteText] = useState('')
  const [file, setFile] = useState(null)
  const [headers, setHeaders] = useState([])
  const [csvRows, setCsvRows] = useState([])
  const [colMap, setColMap] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const onPickFile = async e => {
    const f = e.target.files?.[0]
    if (!f) return
    setErr(''); setFile(f)
    try {
      const { headers: h, rows } = await parseCsvFile(f)
      setHeaders(h); setCsvRows(rows)
      const guessed = {}
      rowFields.forEach(f2 => { guessed[f2.key] = guessColumn(h, f2.candidates) })
      setColMap(guessed)
    } catch (e2) { setErr('Could not read this file: ' + e2.message) }
  }

  const csvPreview = useMemo(() => {
    if (mode !== 'csv') return { rows: [], skipped: 0 }
    let skipped = 0
    const rows = csvRows.map(r => {
      const out = {}
      rowFields.forEach(f2 => { out[f2.key] = f2.numeric ? (parseAmount(r[colMap[f2.key]]) || 0) : String(r[colMap[f2.key]] || '').trim() })
      return out
    }).filter(r => {
      const ok = rowFields.every(f2 => !f2.required || r[f2.key])
      if (!ok) skipped++
      return ok
    })
    return { rows, skipped }
  }, [mode, csvRows, colMap]) // eslint-disable-line

  const pastePreview = useMemo(() => mode === 'paste' ? parseLines(pasteText) : { rows: [], skipped: 0 }, [mode, pasteText])
  const finalRows = mode === 'paste' ? pastePreview.rows : csvPreview.rows
  const skippedCount = mode === 'paste' ? pastePreview.skipped : csvPreview.skipped

  const doImport = async () => {
    if (finalRows.length === 0) return
    setBusy(true); setErr('')
    const payload = finalRows.map(r => buildPayload(r, uid))
    const { error } = await supabase.from(table).insert(payload)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return (
    <div className="panel grid">
      <div className="row between">
        <span className="hud">{title}</span>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
      <div className="tabs" style={{ margin: 0 }}>
        <button className={`tab ${mode === 'paste' ? 'on' : ''}`} onClick={() => setMode('paste')}>PASTE LIST</button>
        <button className={`tab ${mode === 'csv' ? 'on' : ''}`} onClick={() => setMode('csv')}>UPLOAD CSV</button>
      </div>
      {mode === 'paste' && (
        <>
          <span className="hud">{extraFields}</span>
          <textarea className="input" rows={6} value={pasteText} onChange={e => setPasteText(e.target.value)} />
        </>
      )}
      {mode === 'csv' && (
        <>
          <label className="btn-ghost" style={{ cursor: 'pointer', width: 'fit-content' }}>
            {file ? file.name : 'Choose CSV file'}
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={onPickFile} />
          </label>
          {headers.length > 0 && (
            <div className="grid cols2">
              {rowFields.map(f2 => (
                <div className="field" key={f2.key}><label className="hud">{f2.label}</label>
                  <select className="input" value={colMap[f2.key] || ''} onChange={e => setColMap({ ...colMap, [f2.key]: e.target.value })}>
                    <option value="">— select —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {finalRows.length > 0 && (
        <>
          <span className="hud">{finalRows.length} ROWS READY</span>
          {skippedCount > 0 && (
            <div className="auth-err" style={{ color: 'var(--warm)' }}>
              {skippedCount} row{skippedCount === 1 ? '' : 's'} skipped — missing required field.
            </div>
          )}
          <div className="list">
            {finalRows.slice(0, 5).map((r, i) => (
              <div className="item" key={i}><div className="item-title">{JSON.stringify(r)}</div></div>
            ))}
          </div>
        </>
      )}
      {err && <div className="auth-err">{err}</div>}
      <button className="btn-sm" onClick={doImport} disabled={busy || finalRows.length === 0}>
        {busy ? 'Importing…' : `Import ${finalRows.length || ''} row${finalRows.length === 1 ? '' : 's'}`}
      </button>
    </div>
  )
}

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

function Cards({ uid, cards, spentByCard, onChange }) {
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
    if (!window.confirm('Delete this card? This cannot be undone.')) return
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

function Subs({ uid, cards }) {
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
  const del = id => {
    if (!window.confirm('Delete this subscription? This cannot be undone.')) return
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

  if (!uid) return null

  return (
    <PinGate uid={uid} label="VAULT" code="06 — COIN">
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
      {uid && tab === 'expenses' && <Expenses uid={uid} cards={cards} reload={reload} onLogged={() => setReload(r => r + 1)} />}
      {uid && tab === 'cards' && <Cards uid={uid} cards={cards} spentByCard={spentByCard} onChange={() => setReload(r => r + 1)} />}
      {uid && tab === 'subscriptions' && <Subs uid={uid} cards={cards} />}
    </PinGate>
  )
}

