import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { FournisseurAuth } from './context/AuthContext'
import './index.css'

/* Enregistrement du service worker (mode hors ligne + notifications push). */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Cherche une mise à jour à chaque ouverture, puis toutes les heures.
        reg.update().catch(() => {})
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
      })
      .catch((e) => console.warn('[SUIVI FRIGO] Service worker non enregistré :', e))
  })
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <FournisseurAuth>
        <App />
      </FournisseurAuth>
    </BrowserRouter>
  </React.StrictMode>
)
