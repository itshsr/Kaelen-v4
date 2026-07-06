import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { geminiChat, getApiKey, INTEGRITY } from '../lib/gemini'

const KAELEN_SYSTEM = name => `You are KAELEN — a warm, intelligent, personal AI companion inside the user's personal operating system. The user's name is ${name || 'unknown'}. Be concise, genuine, and personal in tone. You are a conversation partner only — the app's tasks, expenses, notes, and habits are managed by the user through the app's own screens, not by you.

${INTEGRITY}`

export default function Core({ profileName }) {
  const [uid, setUid] = useState(null)
  const [hasKey, setHasKey] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const abortRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const id = data.user?.id
      setUid(id)
      setHasKey(!!(await getApiKey()))
      if (id) {
        const { data: m } = await supabase.from('chat_messages')
          .select('*').order('created_at').limit(200)
        setMsgs(m || [])
      }
    })
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setErr(''); setInput('')

    const userMsg = { role: 'user', content: text, persona: 'KAELEN' }
    const nextMsgs = [...msgs, userMsg]
    setMsgs(nextMsgs)
    setBusy(true)
    abortRef.current = new AbortController()

    await supabase.from('chat_messages').insert({ user_id: uid, ...userMsg })

    try {
      const reply = await geminiChat({
        system: KAELEN_SYSTEM(profileName),
        messages: nextMsgs.slice(-20).map(({ role, content }) => ({ role, content })),
        signal: abortRef.current.signal,
      })
      const aiMsg = { role: 'assistant', content: reply, persona: 'KAELEN' }
      setMsgs(m => [...m, aiMsg])
      await supabase.from('chat_messages').insert({ user_id: uid, ...aiMsg })
    } catch (e) {
      if (e.name === 'AbortError') {
        setInput(text) // return message for revision
        setMsgs(m => m.slice(0, -1))
        await supabase.from('chat_messages').delete().eq('user_id', uid).eq('content', text).eq('role', 'user')
      } else if (e.message === 'NO_KEY') {
        setErr('No API key saved. Add one in USER › AI KEY.')
      } else {
        setErr(`Model error: ${e.message}`)
      }
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const stop = () => abortRef.current?.abort()

  if (hasKey === false) {
    return (
      <>
        <Head />
        <div className="panel placeholder">
          <span className="hud">02 — MIND · DORMANT</span>
          <span className="big">No Gemini API key saved.</span>
          <Link to="/user" className="btn-ghost" style={{ textDecoration: 'none' }}>Add key in USER › AI KEY</Link>
        </div>
      </>
    )
  }

  return (
    <>
      <Head />
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: '55vh' }}>
        <div className="chat-scroll">
          {msgs.length === 0 && <div className="empty">Talk to KAELEN. Every message is one API call — nothing runs in the background.</div>}
          {msgs.map((m, i) => (
            <div key={m.id || i} className={`bubble ${m.role}`}>{m.content}</div>
          ))}
          {busy && <div className="bubble assistant thinking"><span/><span/><span/></div>}
          <div ref={bottomRef} />
        </div>
        {err && <div className="auth-err" style={{ marginTop: '0.5rem' }}>{err}</div>}
        <div className="row" style={{ marginTop: '0.7rem' }}>
          <input className="input" placeholder="Message KAELEN" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()} disabled={busy} />
          {busy
            ? <button className="btn-ghost danger" onClick={stop}>Stop</button>
            : <button className="btn-sm" onClick={send} disabled={!input.trim()}>Send</button>}
        </div>
      </div>
    </>
  )
}

function Head() {
  return (
    <div className="section-head">
      <h2 className="display">CORE</h2>
      <span className="hud">02 — MIND</span>
    </div>
  )
}
