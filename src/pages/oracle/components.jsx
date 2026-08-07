import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DECK, drawCards } from '../../lib/tarot'
import { lifePath, destiny, soulUrge, personality, NUM_THEMES } from '../../lib/numerology'
import { geminiChat, INTEGRITY } from '../../lib/gemini'
import { codexFor, CODEX_FRAMEWORK, CODEX } from '../../lib/tarotCodex'

const BASIM_STYLE = `You are the ORACLE voice of this app — measured, symbolic, a little mystical, but honest. Frame every reading as symbolic and interpretive tradition, never as certain prediction. Keep readings under 220 words.

${INTEGRITY}
Additional rules for readings:
- Use ONLY the birth details, names, and cards explicitly given in the prompt. If a detail is missing, say it is missing and stop — never assume or invent it.
- When reference text for a card is provided in the prompt (labeled "REFERENCE:"), that text is the user's own personal tarot study material. Base your interpretation of that card primarily on that reference text, not on your own general knowledge of tarot. Only fall back to widely recognized traditional associations if no reference text is provided for a card.
- Do not invent card meanings beyond what is given or widely recognized traditional associations.`

const today = () => new Date().toISOString().slice(0, 10)

export function usePersons(uid) {
  const [persons, setPersons] = useState([])
  useEffect(() => {
    if (!uid) return
    Promise.all([
      supabase.from('profiles').select('name,birth_date,birth_time,birth_place').eq('id', uid).single(),
      supabase.from('people_profiles').select('*').order('created_at'),
    ]).then(([me, pp]) => {
      const list = []
      if (me.data) list.push({ id: 'self', name: me.data.name || 'Me', ...me.data })
      ;(pp.data || []).forEach(p => list.push(p))
      setPersons(list)
    })
  }, [uid])
  return persons
}

function PersonChips({ persons, sel, setSel }) {
  return (
    <div className="tabs" style={{ marginBottom: '0.8rem' }}>
      {persons.map(p => (
        <button key={p.id} className={`tab ${sel?.id === p.id ? 'on' : ''}`} onClick={() => setSel(p)}>
          {p.name?.toUpperCase() || '—'}
        </button>
      ))}
    </div>
  )
}

/* ---------- Daily Tarot ---------- */
export function DailyTarot({ uid }) {
  const [card, setCard] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) return
    supabase.from('daily_tarot').select('*').eq('drawn_on', today()).maybeSingle()
      .then(({ data }) => {
        if (data) setCard(DECK.find(c => c.name === data.card_name) || { name: data.card_name, meaning: '' })
        setLoading(false)
      })
  }, [uid])

  const draw = async () => {
    const c = drawCards(1)[0]
    // unique(user_id, drawn_on) guarantees one card per day even on double-tap
    const { error } = await supabase.from('daily_tarot').insert({ user_id: uid, card_name: c.name, drawn_on: today() })
    if (!error) setCard(c)
    else {
      const { data } = await supabase.from('daily_tarot').select('*').eq('drawn_on', today()).maybeSingle()
      if (data) setCard(DECK.find(x => x.name === data.card_name))
    }
  }

  if (loading) return null
  return (
    <div className="panel" style={{ textAlign: 'center' }}>
      <div className="hud" style={{ marginBottom: '0.7rem' }}>CARD OF THE DAY · LOCKED UNTIL MIDNIGHT</div>
      {card ? (
        <>
          <div className="display" style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>{card.name}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textAlign: 'left', lineHeight: 1.6 }}>
            {codexFor(card.name) || card.meaning}
          </div>
        </>
      ) : (
        <button className="btn-sm" onClick={draw}>Draw today's card</button>
      )}
    </div>
  )
}

/* ---------- 3-card spread ---------- */
export function Spread({ hasKey }) {
  const [cards, setCards] = useState(null)
  const [reading, setReading] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const abortRef = useRef(null)

  const draw = () => { setCards(drawCards(3)); setReading(''); setErr('') }

  const interpret = async () => {
    setBusy(true); setErr(''); abortRef.current = new AbortController()
    try {
      const { text } = await geminiChat({
        system: BASIM_STYLE,
        messages: [{
          role: 'user',
          content: `Three-card spread (past / present / future):\n${['Past', 'Present', 'Future'].map((label, i) => {
            const c = cards[i]
            const ref = codexFor(c.name)
            return `${i + 1}. ${label} — ${c.name}${ref ? `\nREFERENCE: ${ref}` : ` (${c.meaning})`}`
          }).join('\n')}\n\n${CODEX_FRAMEWORK}\n\nGive a short interpretive reading connecting the three, grounded in the reference text above where provided.`,
        }],
        signal: abortRef.current.signal,
      })
      setReading(text)
    } catch (e) {
      if (e.name !== 'AbortError') setErr(e.message === 'NO_KEY' ? 'No API key saved.' : `Model error: ${e.message}`)
    } finally { setBusy(false) }
  }

  const POS = ['PAST', 'PRESENT', 'FUTURE']
  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: '0.8rem' }}>
        <span className="hud">THREE-CARD SPREAD</span>
        <button className="btn-sm" onClick={draw}>{cards ? 'Draw again' : 'Draw'}</button>
      </div>
      {cards && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', gap: '0.6rem', marginBottom: '0.8rem' }}>
          {cards.map((c, i) => (
            <div key={i} className="item" style={{ flexDirection: 'column', textAlign: 'center', gap: '0.3rem' }}>
              <span className="hud">{POS[i]}</span>
              <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{c.name}</span>
              <span className="item-sub">{c.meaning}</span>
            </div>
          ))}
        </div>
      )}
      {cards && hasKey && !reading && (
        busy
          ? <button className="btn-ghost danger" onClick={() => abortRef.current?.abort()}>Stop</button>
          : <button className="btn-ghost" onClick={interpret}>Interpret (1 API call)</button>
      )}
      {err && <div className="auth-err">{err}</div>}
      {reading && <div style={{ fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{reading}</div>}
      <div className="hud" style={{ marginTop: '0.7rem' }}>SYMBOLIC · INTERPRETIVE · NOT PREDICTION</div>
    </div>
  )
}

/* ---------- Numerology ---------- */
export function Numerology({ persons }) {
  const [sel, setSel] = useState(null)
  useEffect(() => { if (persons.length && !sel) setSel(persons[0]) }, [persons]) // eslint-disable-line

  if (!sel) return <div className="panel empty">Add a profile with birth details in USER.</div>
  const missing = []
  if (!sel.birth_date) missing.push('birth date')
  if (!sel.name) missing.push('name')

  const rows = [
    ['Life Path', lifePath(sel.birth_date)],
    ['Destiny', destiny(sel.name)],
    ['Soul Urge', soulUrge(sel.name)],
    ['Personality', personality(sel.name)],
  ]

  return (
    <div className="panel">
      <PersonChips persons={persons} sel={sel} setSel={setSel} />
      {missing.length > 0 && (
        <div className="auth-err" style={{ textAlign: 'left' }}>
          Missing {missing.join(' and ')} for {sel.name || 'this profile'} — add it in <Link to="/user" style={{ color: 'var(--accent)' }}>USER</Link>. Numbers below are computed only from what exists.
        </div>
      )}
      <div className="list">
        {rows.map(([label, n]) => (
          <div className="item" key={label}>
            <div style={{ flex: 1 }}>
              <div className="item-title" style={{ fontWeight: 600 }}>{label}: {n ?? '—'}</div>
              <div className="item-sub">{n ? NUM_THEMES[n] : 'insufficient data'}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="hud" style={{ marginTop: '0.7rem' }}>PYTHAGOREAN METHOD · COMPUTED FROM REAL DATA ONLY</div>
    </div>
  )
}

/* ---------- AI readings (kundli / horoscope / vastu) ---------- */

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result.split(',')[1])
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export function ManualEntry({ hasKey }) {
  const [cardName, setCardName] = useState(DECK[0].name)
  const [reversed, setReversed] = useState(false)
  const [reading, setReading] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const abortRef = useRef(null)

  const interpret = async () => {
    setBusy(true); setErr(''); setReading(''); abortRef.current = new AbortController()
    try {
      const ref = codexFor(cardName)
      const fallback = DECK.find(c => c.name === cardName)?.meaning || ''
      const orientationNote = reversed
        ? "This card is REVERSED. My reference codex only documents upright meanings, so for the reversed reading, use traditional tarot convention: a reversed card generally suggests the upright meaning is blocked, delayed, turned inward, or experienced in shadow/excess form. Say plainly that the reversed interpretation is drawn from general convention, not my personal reference."
        : "This card is upright — read it directly from the reference text."
      const { text } = await geminiChat({
        system: BASIM_STYLE,
        messages: [{
          role: 'user',
          content: `Single card, manually entered: ${cardName} (${reversed ? 'reversed' : 'upright'}).\n${ref ? `REFERENCE: ${ref}` : `(no reference entry found, general meaning: ${fallback})`}\n${orientationNote}\n\n${CODEX_FRAMEWORK}\n\nGive a short interpretive reading for this single card.`,
        }],
        signal: abortRef.current.signal,
      })
      setReading(text)
    } catch (e) {
      if (e.name !== 'AbortError') setErr(e.message === 'NO_KEY' ? 'No API key saved.' : `Model error: ${e.message}`)
    } finally { setBusy(false) }
  }

  if (!hasKey) return null

  return (
    <div className="panel">
      <div className="hud" style={{ marginBottom: '0.8rem' }}>TYPE YOUR CARD (NO IMAGE, NO VISION CALL)</div>
      <div className="row wrap" style={{ marginBottom: '0.8rem' }}>
        <select className="input" style={{ flex: 2, minWidth: 160 }} value={cardName} onChange={e => { setCardName(e.target.value); setReading('') }}>
          {DECK.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
        <div className="tabs" style={{ margin: 0 }}>
          <button className={`tab ${!reversed ? 'on' : ''}`} onClick={() => { setReversed(false); setReading('') }}>UPRIGHT</button>
          <button className={`tab ${reversed ? 'on' : ''}`} onClick={() => { setReversed(true); setReading('') }}>REVERSED</button>
        </div>
      </div>
      {!reading && (
        busy
          ? <button className="btn-ghost danger" onClick={() => abortRef.current?.abort()}>Stop</button>
          : <button className="btn-sm" onClick={interpret}>Interpret (1 API call, text only)</button>
      )}
      {err && <div className="auth-err">{err}</div>}
      {reading && <div style={{ fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginTop: '0.8rem' }}>{reading}</div>}
      <div className="hud" style={{ marginTop: '0.7rem' }}>SYMBOLIC · INTERPRETIVE · NOT PREDICTION</div>
    </div>
  )
}

export function PhotoScan({ hasKey }) {
  const [preview, setPreview] = useState(null)
  const [reading, setReading] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [file, setFile] = useState(null)
  const abortRef = useRef(null)

  const onPick = e => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f); setReading(''); setErr('')
    setPreview(URL.createObjectURL(f))
  }

  const scan = async () => {
    if (!file) return
    setBusy(true); setErr(''); abortRef.current = new AbortController()
    try {
      const base64 = await fileToBase64(file)
      const { text } = await geminiChat({
        system: BASIM_STYLE + '\nFor photo scans specifically: identify which tarot card(s) are shown in the image (name each one exactly as printed, or your best identification if partially obscured), state whether each is upright or reversed if visible, then give a reading using traditional meanings for those cards. If you cannot confidently identify a card, say so plainly rather than guessing a specific card name.',
        messages: [{
          role: 'user',
          content: `This is a photo of tarot card(s) I have drawn myself. Identify the card(s), then look up each identified card by exact name in the REFERENCE CODEX below and ground your reading in that entry. If a card isn't in the codex or you can't confidently identify it, say so rather than guessing.\n\nREFERENCE CODEX (my personal tarot study material, one entry per card):\n${Object.entries(CODEX).map(([name, text]) => `${name}: ${text}`).join('\n')}\n\n${CODEX_FRAMEWORK}`,
          image: { mimeType: file.type || 'image/jpeg', base64 },
        }],
        signal: abortRef.current.signal,
      })
      setReading(text)
    } catch (e) {
      if (e.name !== 'AbortError') setErr(e.message === 'NO_KEY' ? 'No API key saved.' : `Model error: ${e.message}`)
    } finally { setBusy(false) }
  }

  if (!hasKey) {
    return (
      <div className="panel placeholder">
        <span className="hud">PHOTO SCAN · DORMANT</span>
        <span className="big">Needs the AI layer to read a photo.</span>
        <Link to="/user" className="btn-ghost" style={{ textDecoration: 'none' }}>Add key in USER \u203a AI KEY</Link>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: '0.8rem' }}>
        <span className="hud">SCAN YOUR OWN CARDS</span>
        <label className="btn-ghost" style={{ cursor: 'pointer' }}>
          Upload photo
          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPick} />
        </label>
      </div>
      {preview && (
        <img src={preview} alt="" style={{ maxWidth: '100%', borderRadius: 12, marginBottom: '0.8rem', display: 'block' }} />
      )}
      {file && !reading && (
        busy
          ? <button className="btn-ghost danger" onClick={() => abortRef.current?.abort()}>Stop</button>
          : <button className="btn-sm" onClick={scan}>Identify & interpret (1 API call)</button>
      )}
      {err && <div className="auth-err">{err}</div>}
      {reading && <div style={{ fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginTop: '0.6rem' }}>{reading}</div>}
      <div className="hud" style={{ marginTop: '0.7rem' }}>
        CARD IDENTIFICATION IS AI-ASSISTED, NOT PERFECT · VERIFY AGAINST YOUR OWN DECK
      </div>
    </div>
  )
}

const CELTIC_POS = [
  'PRESENT', 'CHALLENGE', 'FOUNDATION', 'RECENT PAST', 'CROWN (POSSIBLE OUTCOME)',
  'NEAR FUTURE', 'YOUR STANCE', 'EXTERNAL INFLUENCES', 'HOPES OR FEARS', 'FINAL OUTCOME',
]

export function CelticCross({ hasKey }) {
  const [cards, setCards] = useState(null)
  const [reading, setReading] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const abortRef = useRef(null)

  const draw = () => { setCards(drawCards(10)); setReading(''); setErr('') }

  const interpret = async () => {
    setBusy(true); setErr(''); abortRef.current = new AbortController()
    try {
      const lines = cards.map((c, i) => {
        const ref = codexFor(c.name)
        return `${i + 1}. ${CELTIC_POS[i]} \u2014 ${c.name}${ref ? `\nREFERENCE: ${ref}` : ` (${c.meaning})`}`
      }).join('\n')
      const { text } = await geminiChat({
        system: BASIM_STYLE,
        messages: [{
          role: 'user',
          content: `Celtic Cross spread, ten positions:\n${lines}\n\n${CODEX_FRAMEWORK}\n\nGive a structured interpretive reading connecting all ten positions, weighted toward the final outcome, grounded in the reference text above where provided.`,
        }],
        signal: abortRef.current.signal,
      })
      setReading(text)
    } catch (e) {
      if (e.name !== 'AbortError') setErr(e.message === 'NO_KEY' ? 'No API key saved.' : `Model error: ${e.message}`)
    } finally { setBusy(false) }
  }

  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: '0.8rem' }}>
        <span className="hud">CELTIC CROSS · 10 CARDS</span>
        <button className="btn-sm" onClick={draw}>{cards ? 'Draw again' : 'Draw'}</button>
      </div>
      {cards && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: '0.6rem', marginBottom: '0.8rem' }}>
          {cards.map((c, i) => (
            <div key={i} className="item" style={{ flexDirection: 'column', textAlign: 'center', gap: '0.25rem' }}>
              <span className="hud">{i + 1}. {CELTIC_POS[i]}</span>
              <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>{c.name}</span>
              <span className="item-sub">{c.meaning}</span>
            </div>
          ))}
        </div>
      )}
      {cards && hasKey && !reading && (
        busy
          ? <button className="btn-ghost danger" onClick={() => abortRef.current?.abort()}>Stop</button>
          : <button className="btn-ghost" onClick={interpret}>Interpret (1 API call)</button>
      )}
      {err && <div className="auth-err">{err}</div>}
      {reading && <div style={{ fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{reading}</div>}
      <div className="hud" style={{ marginTop: '0.7rem' }}>SYMBOLIC · INTERPRETIVE · NOT PREDICTION</div>
    </div>
  )
}

const AI_MODES = {
  kundli: {
    label: 'KUNDLI',
    needs: ['birth_date', 'birth_time', 'birth_place'],
    prompt: p => `Vedic astrology discussion for ${p.name}, born ${p.birth_date} at ${p.birth_time} in ${p.birth_place}. Discuss general themes associated with this birth data in Vedic tradition. State clearly that precise chart calculation requires an ephemeris and this is a general traditional discussion.`,
  },
  horoscope: {
    label: 'HOROSCOPE',
    needs: ['birth_date'],
    prompt: p => `Reflective daily guidance for ${p.name}, born ${p.birth_date}, for today ${today()}. Frame as interpretive reflection, not prediction.`,
  },
  vastu: {
    label: 'VASTU',
    needs: [],
    prompt: (_p, extra) => `Vastu shastra guidance based on real traditional principles for this space description: "${extra}". If the description lacks needed detail (directions, room purpose), ask for it instead of assuming.`,
  },
}

export function AiReadings({ persons, hasKey }) {
  const [mode, setMode] = useState('kundli')
  const [sel, setSel] = useState(null)
  const [extra, setExtra] = useState('')
  const [out, setOut] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const abortRef = useRef(null)
  useEffect(() => { if (persons.length && !sel) setSel(persons[0]) }, [persons]) // eslint-disable-line

  const m = AI_MODES[mode]
  const missing = sel ? m.needs.filter(k => !sel[k]) : m.needs

  const run = async () => {
    setBusy(true); setErr(''); setOut(''); abortRef.current = new AbortController()
    try {
      const { text } = await geminiChat({
        system: BASIM_STYLE,
        messages: [{ role: 'user', content: m.prompt(sel || {}, extra) }],
        signal: abortRef.current.signal,
      })
      setOut(text)
    } catch (e) {
      if (e.name !== 'AbortError') setErr(e.message === 'NO_KEY' ? 'No API key saved.' : `Model error: ${e.message}`)
    } finally { setBusy(false) }
  }

  if (!hasKey) {
    return (
      <div className="panel placeholder">
        <span className="hud">AI READINGS · DORMANT</span>
        <span className="big">Kundli, horoscope & vastu need the AI layer.</span>
        <Link to="/user" className="btn-ghost" style={{ textDecoration: 'none' }}>Add key in USER › AI KEY</Link>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="tabs">
        {Object.entries(AI_MODES).map(([k, v]) => (
          <button key={k} className={`tab ${mode === k ? 'on' : ''}`} onClick={() => { setMode(k); setOut(''); setErr('') }}>{v.label}</button>
        ))}
      </div>
      {mode !== 'vastu' && <PersonChips persons={persons} sel={sel} setSel={setSel} />}
      {mode === 'vastu' && (
        <textarea className="input" style={{ marginBottom: '0.8rem' }} rows={3}
          placeholder="Describe the space (room purpose, facing direction, layout)…"
          value={extra} onChange={e => setExtra(e.target.value)} />
      )}
      {missing.length > 0 ? (
        <div className="auth-err" style={{ textAlign: 'left' }}>
          {sel?.name || 'This profile'} is missing: {missing.join(', ').replaceAll('_', ' ')}. Add in <Link to="/user" style={{ color: 'var(--accent)' }}>USER</Link> — readings are never done on assumed data.
        </div>
      ) : busy ? (
        <button className="btn-ghost danger" onClick={() => abortRef.current?.abort()}>Stop</button>
      ) : (
        <button className="btn-sm" onClick={run} disabled={mode === 'vastu' && !extra.trim()}>
          Run reading (1 API call)
        </button>
      )}
      {err && <div className="auth-err">{err}</div>}
      {out && <div style={{ fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginTop: '0.8rem' }}>{out}</div>}
      <div className="hud" style={{ marginTop: '0.7rem' }}>SYMBOLIC · INTERPRETIVE · NOT PREDICTION</div>
    </div>
  )
}

