import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// pdfjs-dist (via PdfReader.jsx, pulled in by Grimoire) touches browser Canvas
// APIs at *import* time, not just when actually used — jsdom doesn't implement
// DOMMatrix, so importing it crashes before any component code even runs.
// A no-op stub is enough since these tests never actually render a PDF.
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {}
}
// jsdom doesn't implement scrollIntoView (it has no real layout engine) — every
// actual browser does. Core calls it to keep chat scrolled to the latest message.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// Minimal, safe stand-in for every Supabase call site used across the app.
// Smoke tests only need "renders without throwing" — they don't assert on
// real data — so every query just resolves to empty/null rather than hitting
// the network (which wouldn't work in a test environment anyway).
function chain() {
  const q = {
    select: () => q, insert: () => q, update: () => q, delete: () => q, upsert: () => q,
    eq: () => q, neq: () => q, not: () => q, order: () => q, limit: () => q, single: () => q,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve) => resolve({ data: [], error: null }),
  }
  return q
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => Promise.resolve({ error: null }),
      signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
      signUp: () => Promise.resolve({ data: {}, error: null }),
      resetPasswordForEmail: () => Promise.resolve({ data: {}, error: null }),
    },
    from: () => chain(),
    rpc: () => Promise.resolve({ data: null, error: null }),
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        createSignedUrl: () => Promise.resolve({ data: null, error: null }),
        remove: () => Promise.resolve({ data: null, error: null }),
      }),
    },
  },
}))
