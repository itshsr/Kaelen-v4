import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Something went wrong.' }
  }

  componentDidCatch(error, info) {
    // Kept simple on purpose — no external logging service wired up yet.
    console.error('KAELEN crashed:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '1rem', background: '#060913', color: '#e7e9f5', textAlign: 'center', padding: '2rem',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <span style={{
          fontSize: '1.2rem', letterSpacing: '0.3em', fontWeight: 600,
          background: 'linear-gradient(90deg, #7c9fff, #b98cff)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>KAELEN HIT A SNAG</span>
        <p style={{ opacity: 0.7, maxWidth: 340, fontSize: '0.9rem' }}>
          Something went wrong loading this screen. Your data is safe — this is just a display error.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '0.6rem 1.4rem', borderRadius: 8, border: '1px solid rgba(124,159,255,0.4)',
            background: 'rgba(124,159,255,0.12)', color: '#e7e9f5', fontSize: '0.9rem', cursor: 'pointer',
          }}
        >
          Reload KAELEN
        </button>
      </div>
    )
  }
}
