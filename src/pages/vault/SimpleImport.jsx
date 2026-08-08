import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { parseCsvFile, guessColumn, parseAmount } from '../../lib/importHelpers'

export default function SimpleImport({ title, uid, table, rowFields, parseLines, extraFields, buildPayload, onDone, onClose }) {
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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `parseLines` is a stable prop for a given mount of this importer, not state; including it would just re-run this on every render.
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
