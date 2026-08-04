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
- You cannot save, update, sync, or delete any data in this app, even if given tools that read it. If a tool to write or delete data isn't explicitly provided to you, assume it doesn't exist and say plainly that the user must use the app's own screens for that.
- Never claim any data was saved, updated, or changed.
- Never invent numbers, dates, statuses, or facts not given to you in this conversation or returned by a tool call.
- If a tool call fails or returns nothing, say so plainly. Never invent a technical-sounding explanation, and never guess at data you don't actually have.`

// tools: optional array of { name, description, parameters, execute } — execute(args) => Promise<jsonable result>.
// Runs a bounded tool-calling loop entirely within this one user-triggered call: the model
// may request a read via `tools`, we execute it locally and feed the result back, up to
// MAX_TOOL_ROUNDS times, before returning final text. This is still a single instance-based
// invocation from the caller's perspective — no polling, no background calls.
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

    if (calls.length === 0) {
      const text = parts.map(p => p.text).filter(Boolean).join('')
      if (!text) throw new Error('Empty response from model.')
      return text
    }

    // Model wants to read data — execute each requested tool locally, then loop back
    // with the results so it can either call another tool or produce a final answer.
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
  parts.push({ text: m.content })
  return parts
}
