import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { geminiChat, getApiKey, INTEGRITY } from '../lib/gemini'
import { buildKaelenTools } from '../lib/kaelenTools'

const KAELEN_SYSTEM = (name, now) => `You are KAELEN — a warm, intelligent, personal AI companion inside the user's personal operating system. The user's name is ${name || 'unknown'}. Be concise, genuine, and personal in tone. You are a conversation partner with READ-ONLY access to the user's app data (tasks, deadlines, expenses, budget, habits, cards) through tools, plus a small set of WRITE tools that let you propose adding a task, adding an expense, marking a habit done, or toggling a task's done state. Calling a write tool only shows the user a confirmation card — it never happens automatically, so don't tell them it's done; tell them you've proposed it. For anything you don't have a tool for, tell the user plainly to use the app's own screens.

The current date and time (in the user's local timezone) is: ${now}. Use this if the user asks about the time, date, day of the week, or anything relative to "now" — don't say you lack access to it. This is a one-time snapshot taken when this message was sent, not a live clock, so don't imply you're tracking time continuously.

${INTEGRITY}`

const dateLabel = iso => {
  const d = new Date(iso)
  const dISO = d.toDateString()
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()
  if (dISO === today) return 'Today'
  if (dISO === yesterday) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
}
const relTime = iso => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return dateLabel(iso)
}

export default function Core({ profileName }) {
  const [uid, setUid] = useState(null)
  const [hasKey, setHasKey] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [conversationId, setConversationId] = useState(null)
  const [conversations, setConversations] = useState([])
  const [showList, setShowList] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const abortRef = useRef(null)
  const bottomRef = useRef(null)

  const loadConversations = async () => {
    const { data } = await supabase.from('conversations').select('*').order('updated_at', { ascending: false }).limit(50)
    setConversations(data || [])
    return data || []
  }

  const openConversation = async convId => {
    setConversationId(convId)
    setShowList(false)
    if (!convId) { setMsgs([]); return }
    const { data } = await supabase.from('chat_messages').select('*').eq('conversation_id', convId).order('created_at')
    setMsgs(data || [])
  }

  const newChat = () => {
    // No DB row yet — created lazily on first send, so browsing away from an
    // empty "new chat" doesn't litter the list with blank conversations.
    setConversationId(null)
    setMsgs([])
    setShowList(false)
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const id = data.user?.id
      setUid(id)
      setHasKey(!!(await getApiKey()))
      if (id) {
        const convs = await loadConversations()
        if (convs.length > 0) await openConversation(convs[0].id)
      }
    })
  }, []) // eslint-disable-line

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setErr(''); setInput('')

    let convId = conversationId
    if (!convId) {
      // First message of a fresh chat — create its conversation row now, titled
      // from this message so it's recognizable in the chat list later.
      const title = text.length > 48 ? text.slice(0, 48) + '…' : text
      const { data, error } = await supabase.from('conversations').insert({ user_id: uid, title }).select().single()
      if (error) { setErr(error.message); return }
      convId = data.id
      setConversationId(convId)
      setConversations(c => [data, ...c])
    } else {
      supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId).then(() => {})
      setConversations(c => {
        const updated = c.map(x => x.id === convId ? { ...x, updated_at: new Date().toISOString() } : x)
        return updated.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      })
    }

    const userMsg = { role: 'user', content: text, persona: 'KAELEN', conversation_id: convId }
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
        // text summary, so the model doesn't lose that context. Scoped to just this
        // conversation, not your whole history — keeps context (and token use) tight.
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
        const aiMsg = { role: 'assistant', content: result.text, persona: 'KAELEN', conversation_id: convId }
        setMsgs(m => [...m, aiMsg])
        await supabase.from('chat_messages').insert({ user_id: uid, ...aiMsg })
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        setInput(text) // return message for revision
        setMsgs(m => m.slice(0, -1))
        await supabase.from('chat_messages').delete().eq('user_id', uid).eq('content', text).eq('role', 'user').eq('conversation_id', convId)
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
    await supabase.from('chat_messages').insert({ user_id: uid, role: 'assistant', content: summary, persona: 'KAELEN', conversation_id: conversationId })
  }

  const deleteConversation = async (e, convId) => {
    e.stopPropagation()
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return
    await supabase.from('conversations').delete().eq('id', convId)
    setConversations(c => c.filter(x => x.id !== convId))
    if (convId === conversationId) newChat()
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

  let lastDate = null

  return (
    <>
      <div className="chat-shell">
        <div className="row between" style={{ marginBottom: '0.6rem' }}>
          <span className="hud">CORE · 02 — MIND</span>
          <div className="row" style={{ gap: '0.5rem' }}>
            <div style={{ position: 'relative' }}>
              <button className="btn-ghost" onClick={() => setShowList(v => !v)}>☰ Chats</button>
              {showList && (
                <div style={{
                  position: 'absolute', top: '110%', left: 0, zIndex: 20, width: 260, maxHeight: 320, overflowY: 'auto',
                  background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 12, padding: '0.4rem',
                }}>
                  {conversations.length === 0 && <div className="empty" style={{ padding: '0.6rem' }}>No conversations yet.</div>}
                  {conversations.map(c => (
                    <div key={c.id} onClick={() => openConversation(c.id)} className="row between"
                      style={{
                        padding: '0.5rem 0.6rem', borderRadius: 8, cursor: 'pointer', gap: '0.4rem',
                        background: c.id === conversationId ? 'rgba(124,159,255,0.12)' : 'transparent',
                      }}>
                      <div style={{ overflow: 'hidden' }}>
                        <div className="item-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                        <div className="item-sub">{relTime(c.updated_at)}</div>
                      </div>
                      <button className="btn-ghost danger" style={{ flexShrink: 0 }} onClick={e => deleteConversation(e, c.id)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="btn-ghost" onClick={newChat}>+ New chat</button>
          </div>
        </div>

        <div className="chat-scroll">
          {msgs.length === 0 && <div className="empty">Talk to KAELEN. Ask about your tasks, budget, or habits — or ask it to add a task or log an expense, which you'll confirm before anything changes.</div>}
          {msgs.map((m, i) => {
            const showDate = m.created_at && dateLabel(m.created_at) !== lastDate
            if (m.created_at) lastDate = dateLabel(m.created_at)
            return (
              <div key={m.id || m.localId || i} style={{ display: 'contents' }}>
                {showDate && (
                  <div className="hud" style={{ textAlign: 'center', margin: '0.6rem 0', opacity: 0.6 }}>{dateLabel(m.created_at)}</div>
                )}
                {m.role === 'pending-action' ? (
                  <div className="bubble assistant" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
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
                  <div className={`bubble ${m.role}`}>{m.content}</div>
                )}
              </div>
            )
          })}
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
