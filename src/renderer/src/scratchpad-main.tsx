import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { ThemeProvider } from '@renderer/theme/ThemeProvider'
import { Scratchpad } from './features/scratchpad/Scratchpad'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <Scratchpad />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>
)
