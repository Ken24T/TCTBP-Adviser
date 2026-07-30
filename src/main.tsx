import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './portfolio.css'
import './recommendation.css'
import './repository-state.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
