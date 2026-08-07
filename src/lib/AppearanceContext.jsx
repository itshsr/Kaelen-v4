import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { DEFAULT_APPEARANCE, applyAppearance } from './appearance'

const VALID_THEMES = ['dark', 'light', 'custom']
const Ctx = createContext(null)

export function AppearanceProvider({ session, children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem('kaelen-theme')
    return VALID_THEMES.includes(saved) ? saved : 'dark'
  })
  const [appearance, setAppearanceState] = useState(DEFAULT_APPEARANCE)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('kaelen-theme', theme)
    applyAppearance(appearance, theme)
    document.body.classList.toggle('has-custom-bg', appearance.backgroundArt === 'custom')
  }, [theme, appearance])

  useEffect(() => {
    if (!session) return
    supabase.from('profiles').select('theme, appearance').eq('id', session.user.id).single()
      .then(({ data }) => {
        // Ember/Verdant were removed as theme options — fall back to Void for
        // anyone whose saved preference still points at a retired theme.
        if (data?.theme) setThemeState(VALID_THEMES.includes(data.theme) ? data.theme : 'dark')
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

  return (
    <Ctx.Provider value={{ theme, setTheme, appearance, setAppearance }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAppearance() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppearance must be used within AppearanceProvider')
  return ctx
}
