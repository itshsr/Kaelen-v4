import { supabase } from './supabase'

// AI layer — dormant unless a Gemini API key is saved in USER › AI KEY.
// Every call is explicitly user-triggered. No background/auto calls anywhere.
// Model string configurable; verify availability in Google AI Studio if a model error is returned.
const MODEL = 'gemini-2.5-flash'

export async function getApiKey() {
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) return null
  const { data } = await supabase.from('profiles').select('gemini_api_key').eq('id', u.user.id).single()
  return data?.gemini_api_key || null
}

// Shared integrity instruction — inherited by every AI feature. Single source (spec §6.3).
export const INTEGRITY = `Non-negotiable integrity rules:
- You cannot perform any action in this app. You cannot save, update, sync, or delete any data. If asked to, say plainly that you can only talk and the user must use the app's own screens.
- Never claim any data was saved, updated, or changed.
- Never invent numbers, dates, statuses, or facts not given to you in this conversation.
- If something fails or you don't know, say so plainly. Never invent a technical-sounding explanation.`

export async function geminiChat({ system, messages, signal }) {
  const key = await getApiKey()
  if (!key) throw new Error('NO_KEY')

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
      }),
    },
  )

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { detail = (await res.json())?.error?.message || detail } catch { /* keep status */ }
    throw new Error(detail)
  }
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || ''
  if (!text) throw new Error('Empty response from model.')
  return text
}
