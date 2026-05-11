import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { PilogHotkeysProvider } from '@renderer/shortcuts/PilogHotkeysProvider'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PilogHotkeysProvider>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </PilogHotkeysProvider>
  </StrictMode>
)
