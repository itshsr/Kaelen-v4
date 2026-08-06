import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { geminiChat, getApiKey, INTEGRITY } from '../lib/gemini'
import { buildKaelenTools } from '../lib/kaelenTools'

const KAELEN_SYSTEM = (name, now) => `You are KAELEN — a warm, intelligent, personal AI companion inside the user's personal operating system. The user's name is ${name || 'unknown'}. Be concise, genuine, and personal in tone. You are a conversation partner with READ-ONLY access to the user's app data (tasks, deadlines, expenses, budget, habits) through tools, plus a small set of WRITE tools that let you propose adding a task, adding an expense, marking a habit done, or toggling a task's done state. Calling a write tool only shows the user a confirmation card — it never happens automatically, so don't tell them it's done; tell them you've proposed it. For anything you don't have a tool for, tell the user plainly to use the app's own screens.

The current date and time (in the user's local timezone) is: ${now}. Use this if the user asks about the time, date, day of the week, or anything relative to "now" — don't say you lack access to it. This is a one-time snapshot taken when this message was sent, not a live clock, so don't imply you're tracking time continuously.

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
      // Snapshot taken right here, at send-time only — never polled or refreshed
      // in the background, so this stays a per-message call, not a live clock.
      const now = new Date().toLocaleString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      })
      const result = await geminiChat({
        system: KAELEN_SYSTEM(profileName, now),
        // Filter out local-only UI entries (pending-action cards have no plain-text
        // `content`) — sending one to Gemini produces an empty/malformed part and a
        // hard 400 error. Once an action is resolved we already persist a proper
        // text summary, so the model doesn't lose that context.
        messages: nextMsgs.filter(m => typeof m.content === 'string').slice(-20).map(({ role, content }) => ({ role, content })),
        tools: uid ? buildKaelenTools(uid) : undefined,
        signal: abortRef.current.signal,
      })

      if (result.pendingActions.length > 0) {
        // Proposed write(s) — shown as a confirm/cancel card, nothing persisted or
        // executed until the user taps Confirm on a specific action below.
        const tools = buildKaelenTools(uid)
        const localId = `action-${Date.now()}`
        setMsgs(m => [...m, {
          localId, role: 'pending-action', leadingText: result.text,
          actions: result.pendingActions.map(a => ({
            ...a, status: 'pending',
            label: tools.find(t => t.name === a.name)?.confirmLabel(a.args) || a.name,
          })),
        }])
      } else {
        const aiMsg = { role: 'assistant', content: result.text, persona: 'KAELEN' }
        setMsgs(m => [...m, aiMsg])
        await supabase.from('chat_messages').insert({ user_id: uid, ...aiMsg })
      }
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

  // Runs (or cancels) exactly one proposed write, and only when the user taps the
  // button — this is the sole place any write tool's execute() is ever called.
  const resolveAction = async (localId, idx, confirmed) => {
    const msg = msgs.find(m => m.localId === localId)
    const action = msg?.actions?.[idx]
    if (!action || action.status !== 'pending') return

    let status, note
    if (confirmed) {
      const tools = buildKaelenTools(uid)
      const tool = tools.find(t => t.name === action.name)
      try {
        const res = await tool.execute(action.args)
        if (res?.error) { status = 'error'; note = res.error }
        else { status = 'done'; note = res?.already_done ? 'Already marked done today.' : 'Done.' }
      } catch (e) {
        status = 'error'; note = e.message || 'Failed.'
      }
    } else {
      status = 'cancelled'; note = 'Cancelled — nothing was changed.'
    }

    setMsgs(m => m.map(mm => mm.localId === localId
      ? { ...mm, actions: mm.actions.map((a, i) => i === idx ? { ...a, status, note } : a) }
      : mm))

    const summary = `${status === 'done' ? '✅' : status === 'error' ? '⚠️' : '🚫'} ${action.label} — ${note}`
    await supabase.from('chat_messages').insert({ user_id: uid, role: 'assistant', content: summary, persona: 'KAELEN' })
  }

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
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: '55dvh' }}>
        <div className="chat-scroll">
          {msgs.length === 0 && <div className="empty">Talk to KAELEN. Ask about your tasks, budget, or habits — or ask it to add a task or log an expense, which you'll confirm before anything changes.</div>}
          {msgs.map((m, i) => (
            m.role === 'pending-action' ? (
              <div key={m.localId} className="bubble assistant" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {m.leadingText && <div>{m.leadingText}</div>}
                {m.actions.map((a, idx) => (
                  <div key={idx} style={{
                    border: '1px solid rgba(124,159,255,0.3)', borderRadius: 10, padding: '0.6rem 0.8rem',
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                  }}>
                    <span>{a.label}</span>
                    {a.status === 'pending' ? (
                      <div className="row" style={{ gap: '0.5rem' }}>
                        <button className="btn-sm" onClick={() => resolveAction(m.localId, idx, true)}>Confirm</button>
                        <button className="btn-ghost" onClick={() => resolveAction(m.localId, idx, false)}>Cancel</button>
                      </div>
                    ) : (
                      <span className="item-sub">
                        {a.status === 'done' ? '✅' : a.status === 'error' ? '⚠️' : '🚫'} {a.note}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div key={m.id || i} className={`bubble ${m.role}`}>{m.content}</div>
            )
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
