import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { DEFAULT_APPEARANCE, applyAppearance } from './appearance'

const Ctx = createContext(null)

export function AppearanceProvider({ session, children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('kaelen-theme') || 'dark')
  const [appearance, setAppearanceState] = useState(DEFAULT_APPEARANCE)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('kaelen-theme', theme)
    applyAppearance(appearance, theme)
  }, [theme, appearance])

  useEffect(() => {
    if (!session) return
    supabase.from('profiles').select('theme, appearance').eq('id', session.user.id).single()
      .then(({ data }) => {
        if (data?.theme) setThemeState(data.theme)
        if (data?.appearance) setAppearanceState({ ...DEFAULT_APPEARANCE, ...data.appearance })
      })
  }, [session])

  const setTheme = async next => {
    setThemeState(next)
    if (session) await supabase.from('profiles').update({ theme: next }).eq('id', session.user.id)
  }

  const setAppearance = async patch => {
    const next = { ...appearance, ...patch }
    setAppearanceState(next)
    if (session) await supabase.from('profiles').update({ appearance: next }).eq('id', session.user.id)
  }

  // Merge one theme's bubble override without clobbering other themes' saved overrides.
  const setBubbleStyle = async (themeId, patch) => {
    const next = { ...appearance, bubbles: { ...appearance.bubbles, [themeId]: { ...appearance.bubbles?.[themeId], ...patch } } }
    setAppearanceState(next)
    if (session) await supabase.from('profiles').update({ appearance: next }).eq('id', session.user.id)
  }

  return (
    <Ctx.Provider value={{ theme, setTheme, appearance, setAppearance, setBubbleStyle }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAppearance() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppearance must be used within AppearanceProvider')
  return ctx
}
