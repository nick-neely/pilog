import { useEffect, useState } from 'react'
import { Inbox } from './features/inbox/Inbox'
import { Settings } from './features/settings/Settings'
import { Repositories } from './features/repositories/Repositories'
import { AgentRuns } from './features/agent-runs/AgentRuns'

type Route = 'inbox' | 'settings' | 'repositories' | 'agent-runs'

function App(): React.JSX.Element {
  const [route, setRoute] = useState<Route>('inbox')
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null)

  useEffect(() => {
    const unsubInbox = window.pilog.on('navigate:inbox', () => setRoute('inbox'))
    const unsubSettings = window.pilog.on('navigate:settings', () => setRoute('settings'))
    return () => {
      unsubInbox()
      unsubSettings()
    }
  }, [])

  if (route === 'settings') {
    return (
      <Settings
        onBack={() => setRoute('inbox')}
        onNavigateRepositories={() => setRoute('repositories')}
      />
    )
  }

  if (route === 'repositories') {
    return <Repositories onBack={() => setRoute('settings')} />
  }

  if (route === 'agent-runs') {
    return (
      <AgentRuns
        onBack={() => setRoute('inbox')}
        onOpenSourceNote={(noteId) => {
          setFocusedNoteId(noteId)
          setRoute('inbox')
        }}
      />
    )
  }

  return (
    <Inbox
      focusNoteId={focusedNoteId}
      onFocusNoteHandled={() => setFocusedNoteId(null)}
      onNavigateToAgentRuns={() => setRoute('agent-runs')}
      onNavigateToRepositories={() => setRoute('repositories')}
      onNavigateToSettings={() => setRoute('settings')}
    />
  )
}

export default App
