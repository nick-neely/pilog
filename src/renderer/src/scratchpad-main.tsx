import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Scratchpad } from './features/scratchpad/Scratchpad'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Scratchpad />
  </StrictMode>
)
