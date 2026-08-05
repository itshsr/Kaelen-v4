import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getApiKey } from '../lib/gemini'
import {
  usePersons, DailyTarot, Spread, CelticCross, ManualEntry, PhotoScan, Numerology, AiReadings,
} from './oracle/components'

const TAROT_MODES = [
  { id: 'spread', label: 'Three-Card' },
  { id: 'celtic', label: 'Celtic Cross' },
  { id: 'manual', label: 'Type a Card' },
  { id: 'photo', label: 'Scan Photo' },
]

export default function Oracle() {
  const [uid, setUid] = useState(null)
  const [hasKey, setHasKey] = useState(false)
  const [tab, setTab] = useState('tarot')
  const [tarotMode, setTarotMode] = useState('spread')
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
          <div className="tabs" style={{ marginTop: '0.2rem' }}>
            {TAROT_MODES.map(m => (
              <button key={m.id} className={`tab ${tarotMode === m.id ? 'on' : ''}`} onClick={() => setTarotMode(m.id)}>
                {m.label.toUpperCase()}
              </button>
            ))}
          </div>
          {tarotMode === 'spread' && <Spread hasKey={hasKey} />}
          {tarotMode === 'celtic' && <CelticCross hasKey={hasKey} />}
          {tarotMode === 'manual' && <ManualEntry hasKey={hasKey} />}
          {tarotMode === 'photo' && <PhotoScan hasKey={hasKey} />}
        </div>
      )}
      {uid && tab === 'numerology' && <Numerology persons={persons} />}
      {uid && tab === 'readings' && <AiReadings persons={persons} hasKey={hasKey} />}
    </>
  )
}
