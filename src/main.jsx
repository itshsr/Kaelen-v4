import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Apply saved theme before first paint — prevents theme flash (known prior bug).
document.documentElement.dataset.theme = localStorage.getItem('kaelen-theme') || 'dark'

// On the Android shell, reserve real space for the native status bar instead of
// letting it overlay the topbar (was blocking the LIGHT/EXIT buttons).
import('@capacitor/core').then(({ Capacitor }) => {
  if (Capacitor.isNativePlatform()) {
    import('@capacitor/status-bar').then(({ StatusBar }) => {
      StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {})
    })
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

document.getElementById('boot-loader')?.remove()
