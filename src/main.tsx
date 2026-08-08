import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { isAndroidApp } from './androidBridge'
import './styles.css'

if (isAndroidApp()) {
  document.documentElement.classList.add('android-app')
}

if ('serviceWorker' in navigator && ['http:', 'https:'].includes(window.location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(console.error)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
