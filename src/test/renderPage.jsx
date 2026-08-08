import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppearanceProvider } from '../lib/AppearanceContext'
import { SecurityProvider } from '../lib/SecurityContext'
import { ConfirmProvider } from '../lib/ConfirmContext'

// Wraps a page component with every context provider the app normally
// supplies via App.jsx, so pages that call useAppearance()/useSecurity()/
// useConfirm() (directly or via PinGate) don't throw "must be used within
// Provider" during a smoke test. session=null is intentional — these tests
// only check "does it render without crashing while signed out/loading",
// not real authenticated behavior.
export function renderPage(ui) {
  return render(
    <MemoryRouter>
      <AppearanceProvider session={null}>
        <SecurityProvider>
          <ConfirmProvider>{ui}</ConfirmProvider>
        </SecurityProvider>
      </AppearanceProvider>
    </MemoryRouter>,
  )
}
