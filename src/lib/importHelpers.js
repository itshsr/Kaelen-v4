import Papa from 'papaparse'

export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: res => resolve({ headers: res.meta.fields || [], rows: res.data }),
      error: reject,
    })
  })
}

// Best-effort auto-detect of common bank-statement header names.
export function guessColumn(headers, candidates) {
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const c of candidates) {
    const i = lower.findIndex(h => h === c)
    if (i !== -1) return headers[i]
  }
  for (const c of candidates) {
    const i = lower.findIndex(h => h.includes(c))
    if (i !== -1) return headers[i]
  }
  return ''
}

export const DATE_CANDIDATES = ['date', 'transaction date', 'txn date', 'value date']
export const AMOUNT_CANDIDATES = ['amount', 'debit', 'withdrawal', 'withdrawal amt']
export const CREDIT_CANDIDATES = ['credit', 'deposit', 'deposit amt']
export const DESC_CANDIDATES = ['description', 'narration', 'particulars', 'note', 'remarks']

export function parseAmount(raw) {
  if (raw == null) return NaN
  const cleaned = String(raw).replace(/[₹$,\s]/g, '')
  return parseFloat(cleaned)
}

// Returns an ISO date string if parseable, or null if not — callers decide
// whether to default to today, but the null lets them also flag it to the user
// instead of silently misdating a row with no indication anything went wrong.
export function parseDate(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  // try common DD/MM/YYYY or DD-MM-YYYY first (typical Indian bank exports)
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (dmy) {
    let [, d, m, y] = dmy
    if (y.length === 2) y = '20' + y
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    if (!isNaN(new Date(iso).getTime())) return iso
  }
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

// "amount, category, note" per line — for manual paste of expenses.
// Returns { rows, skipped } — skipped is the count of lines that didn't parse to
// a valid positive amount, so the UI can tell the user rows were dropped instead
// of silently importing fewer rows than were pasted.
export function parseExpenseLines(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const rows = []
  let skipped = 0
  for (const line of lines) {
    const [amt, category, ...rest] = line.split(',').map(s => s.trim())
    const amount = parseAmount(amt)
    if (isNaN(amount) || amount <= 0) { skipped++; continue }
    rows.push({ amount, category: category || 'Other', note: rest.join(',').trim() || null })
  }
  return { rows, skipped }
}

// "label, limit" per line — for manual paste of cards.
export function parseCardLines(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const rows = []
  let skipped = 0
  for (const line of lines) {
    const [label, limit] = line.split(',').map(s => s.trim())
    if (!label) { skipped++; continue }
    rows.push({ label, credit_limit: parseAmount(limit) || 0 })
  }
  return { rows, skipped }
}

// "name, amount" per line — for manual paste of subscriptions.
export function parseSubLines(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const rows = []
  let skipped = 0
  for (const line of lines) {
    const [name, amount] = line.split(',').map(s => s.trim())
    if (!name) { skipped++; continue }
    rows.push({ name, amount: parseAmount(amount) || 0 })
  }
  return { rows, skipped }
}
