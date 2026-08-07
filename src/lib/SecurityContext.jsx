import { createContext, useContext, useState } from 'react'

const Ctx = createContext(null)

// Session-only (plain React state, not persisted) — unlocking Vault or User
// once unlocks both for the rest of this app session. Closing and reopening
// the app resets it, so you're prompted again next time, but navigating
// between sections within one session no longer re-asks every visit.
export function SecurityProvider({ children }) {
  const [unlocked, setUnlocked] = useState(false)
  return <Ctx.Provider value={{ unlocked, setUnlocked }}>{children}</Ctx.Provider>
}

export function useSecurity() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSecurity must be used within SecurityProvider')
  return ctx
}
