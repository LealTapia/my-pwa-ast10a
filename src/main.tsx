import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Splash from './Splash.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/serviceWorker.js')
      .then((reg) => {
        console.log('SW registrado:', reg.scope)
      })
      .catch((err) => {
        console.error('Error al registrar SW:', err)
      })
  })
}