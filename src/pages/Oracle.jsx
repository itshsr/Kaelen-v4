import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { DECK, drawCards } from '../lib/tarot'
import { lifePath, destiny, soulUrge, personality, NUM_THEMES } from '../lib/numerology'
import { geminiChat, getApiKey, INTEGRITY } from '../lib/gemini'

const BASIM_STYLE = `You are the ORACLE voice of this app — measured, symbolic, a little mystical, but honest. Frame every reading as symbolic and interpretive tradition, never as certain prediction. Keep readings under 180 words.

${INTEGRITY}
Additional rules for readings:
- Use ONLY the birth details, names, and cards explicitly given in the prompt. If a detail is missing, say it is missing and stop — never assume or invent it.
- Do not invent card meanings beyond widely recognized traditional associations.`

const today = () => new Date().toISOString().slice(0, 10)

function usePersons(uid) {
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
function DailyTarot({ uid }) {
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
          <div style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>{card.meaning}</div>
        </>
      ) : (
        <button className="btn-sm" onClick={draw}>Draw today's card</button>
      )}
    </div>
  )
}

/* ---------- 3-card spread ---------- */
function Spread({ hasKey }) {
  const [cards, setCards] = useState(null)
  const [reading, setReading] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const abortRef = useRef(null)

  const draw = () => { setCards(drawCards(3)); setReading(''); setErr('') }

  const interpret = async () => {
    setBusy(true); setErr(''); abortRef.current = new AbortController()
    try {
      const text = await geminiChat({
        system: BASIM_STYLE,
        messages: [{
          role: 'user',
          content: `Three-card spread (past / present / future):\n1. Past — ${cards[0].name} (${cards[0].meaning})\n2. Present — ${cards[1].name} (${cards[1].meaning})\n3. Future — ${cards[2].name} (${cards[2].meaning})\nGive a short interpretive reading connecting the three.`,
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
function Numerology({ persons }) {
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

function AiReadings({ persons, hasKey }) {
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
      const text = await geminiChat({
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

export default function Oracle() {
  const [uid, setUid] = useState(null)
  const [hasKey, setHasKey] = useState(false)
  const [tab, setTab] = useState('tarot')
  const persons = usePersons(uid)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUid(data.user?.id)
      setHasKey(!!(await getApiKey()))
    })
  }, [])

  return (
    <>
      <div className="section-head">
        <h2 className="display">ORACLE</h2>
        <span className="hud">04 — VEIL · LIVE</span>
      </div>
      <div className="tabs">
        {['tarot', 'numerology', 'readings'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t.toUpperCase()}</button>
        ))}
      </div>
      {uid && tab === 'tarot' && (
        <div className="grid">
          <DailyTarot uid={uid} />
          <Spread hasKey={hasKey} />
        </div>
      )}
      {uid && tab === 'numerology' && <Numerology persons={persons} />}
      {uid && tab === 'readings' && <AiReadings persons={persons} hasKey={hasKey} />}
    </>
  )
}
