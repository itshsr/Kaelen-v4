import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useConfirm } from '../../lib/ConfirmContext'
import {
  parseCsvFile, guessColumn, parseAmount, parseDate,
  DATE_CANDIDATES, AMOUNT_CANDIDATES, CREDIT_CANDIDATES, DESC_CANDIDATES,
  parseExpenseLines,
} from '../../lib/importHelpers'
import { inr, DEFAULT_CATS, monthStart } from './shared'

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

export default function Expenses({ uid, cards, reload, onLogged }) {
  const confirm = useConfirm()
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
    if (!(await confirm('Delete this expense? This cannot be undone.'))) return
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
