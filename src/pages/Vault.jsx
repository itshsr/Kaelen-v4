import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PinGate from '../components/PinGate'
import { useUid } from './vault/shared'
import Budget from './vault/Budget'
import Expenses from './vault/Expenses'
import Cards from './vault/Cards'
import Subs from './vault/Subs'

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
