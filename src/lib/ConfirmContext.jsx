import { createContext, useCallback, useContext, useState } from 'react'

const Ctx = createContext(null)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null) // { message, resolve } | null

  const confirm = useCallback(message => {
    return new Promise(resolve => {
      setState({ message, resolve })
    })
  }, [])

  const respond = ok => {
    state?.resolve(ok)
    setState(null)
  }

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {state && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: '1.2rem',
        }}>
          <div className="panel" style={{ maxWidth: 340, width: '100%' }}>
            <p style={{ margin: '0 0 1rem', lineHeight: 1.5 }}>{state.message}</p>
            <div className="row" style={{ gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => respond(false)}>Cancel</button>
              <button className="btn-ghost danger" onClick={() => respond(true)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}

// await confirm("Delete this task?") — resolves true/false, same call shape as
// window.confirm() but themed and consistent instead of a native browser dialog.
export function useConfirm() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}
