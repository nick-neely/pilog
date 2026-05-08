import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { Scratchpad } from './features/scratchpad/Scratchpad'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <Scratchpad />
    </TooltipProvider>
  </StrictMode>
)
