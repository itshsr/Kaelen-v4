import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Apply saved theme before first paint — prevents theme flash (known prior bug).
document.documentElement.dataset.theme = localStorage.getItem('kaelen-theme') || 'dark'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
