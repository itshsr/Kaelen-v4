import { supabase } from './supabase'

// AI layer — dormant unless a Gemini API key is saved in USER › AI KEY.
// Every call is explicitly user-triggered. No background/auto calls anywhere.
// Model string configurable; verify availability in Google AI Studio if a model error is returned.
const MODEL = 'gemini-2.5-flash'
const MAX_TOOL_ROUNDS = 4 // hard cap so a confused model can't loop indefinitely burning free-tier quota

export async function getApiKey() {
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) return null
  const { data, error } = await supabase.rpc('get_gemini_key')
  if (error) return null
  return data || null
}

// Shared integrity instruction — inherited by every AI feature. Single source (spec §6.3).
export const INTEGRITY = `Non-negotiable integrity rules:
- If you are given "write" tools (adding/changing data), calling one only PROPOSES the action to the user as a card with Confirm/Cancel buttons — it is never executed automatically. Never tell the user something was "added", "saved", "marked done", or "changed"; say you've proposed it and they need to confirm in the app.
- If a tool you'd need for something isn't given to you, assume it doesn't exist — don't claim you can do something you weren't given a tool for.
- Never invent numbers, dates, statuses, or facts not given to you in this conversation or returned by a tool call.
- If a tool call fails or returns nothing, say so plainly. Never invent a technical-sounding explanation, and never guess at data you don't actually have.`

// tools: optional array of { name, description, parameters, write?, execute } — execute(args) => Promise<jsonable result>.
// Read tools (write falsy) run inline within this one call: the model requests a read, we
// execute it locally and feed the result back, up to MAX_TOOL_ROUNDS times, before returning
// final text — still a single instance-based invocation, no polling, no background calls.
// Write tools (write: true) are NEVER executed here — the moment the model calls one, the loop
// stops and the call is handed back to the caller as a pendingAction for the user to confirm
// or cancel in the UI. Actually running a write tool is the caller's job, only after that tap.
export async function geminiChat({ system, messages, tools, signal }) {
  const key = await getApiKey()
  if (!key) throw new Error('NO_KEY')

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: buildParts(m),
  }))

  const toolDecl = tools?.length
    ? [{ function_declarations: tools.map(({ name, description, parameters }) => ({ name, description, parameters })) }]
    : undefined

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents,
          ...(toolDecl ? { tools: toolDecl } : {}),
        }),
      },
    )

    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try { detail = (await res.json())?.error?.message || detail } catch { /* keep status */ }
      throw new Error(detail)
    }
    const data = await res.json()
    const parts = data?.candidates?.[0]?.content?.parts || []
    const calls = parts.filter(p => p.functionCall)
    const leadingText = parts.filter(p => p.text).map(p => p.text).join('')

    if (calls.length === 0) {
      if (!leadingText) throw new Error('Empty response from model.')
      return { text: leadingText, pendingActions: [] }
    }

    const writeCalls = calls.filter(c => tools.find(t => t.name === c.functionCall.name)?.write)
    if (writeCalls.length > 0) {
      // Stop immediately — do not execute. Hand these back for the UI to confirm.
      return {
        text: leadingText,
        pendingActions: writeCalls.map(c => ({ name: c.functionCall.name, args: c.functionCall.args || {} })),
      }
    }

    // All read tools — execute locally and loop back so the model can answer or ask for more.
    contents.push({ role: 'model', parts })
    const responseParts = []
    for (const call of calls) {
      const { name, args } = call.functionCall
      const tool = tools.find(t => t.name === name)
      let response
      try {
        response = tool ? await tool.execute(args || {}) : { error: `Unknown tool: ${name}` }
      } catch (e) {
        response = { error: e.message || 'Tool execution failed' }
      }
      responseParts.push({ functionResponse: { name, response } })
    }
    contents.push({ role: 'function', parts: responseParts })
  }

  throw new Error('KAELEN made too many tool calls without answering — try rephrasing.')
}

// message may optionally carry { image: { mimeType, base64 } } for multimodal (vision) calls.
function buildParts(m) {
  const parts = []
  if (m.image) parts.push({ inline_data: { mime_type: m.image.mimeType, data: m.image.base64 } })
  parts.push({ text: typeof m.content === 'string' ? m.content : '' })
  return parts
}
