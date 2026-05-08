import { useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { Inbox } from './features/inbox/Inbox'
import { Settings } from './features/settings/Settings'
import { Repositories } from './features/repositories/Repositories'
import { AgentRuns } from './features/agent-runs/AgentRuns'

type Route = 'inbox' | 'settings' | 'repositories' | 'agent-runs'

// View descriptors live at app level so the AppShell's tabs map 1:1 to
// our route values. Adding a new tab is one entry here plus a handler
// in the route switch below — the rest of the chrome handles itself.
const VIEW_TABS = [
  {
    value: 'inbox' as const,
    label: 'Inbox',
    testId: 'view-tab-inbox-trigger',
    activeTestId: 'view-tab-inbox'
  },
  {
    value: 'runs' as const,
    label: 'Runs',
    // Preserved e2e-stable id; existing tests select this to navigate
    // forward into the Agent Runs view from the Inbox surface.
    testId: 'open-agent-runs',
    activeTestId: 'view-tab-runs'
  }
]

function App(): React.JSX.Element {
  const [route, setRoute] = useState<Route>('inbox')
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null)
  // Lifted because the Cmd-K trigger now lives in the global top bar; the
  // palette dialog itself stays inside Inbox where the inbox-specific
  // commands are wired.
  const [paletteOpen, setPaletteOpen] = useState(false)

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

  const activeTab = route === 'inbox' ? 'inbox' : 'runs'

  return (
    <AppShell
      tabs={VIEW_TABS}
      activeTab={activeTab}
      onTabChange={(next) => setRoute(next === 'inbox' ? 'inbox' : 'agent-runs')}
      onNavigateToSettings={() => setRoute('settings')}
      // Cmd-K lives in Inbox's command surface today; only show the
      // chrome trigger when the active view actually has a palette.
      onOpenCommandPalette={route === 'inbox' ? () => setPaletteOpen(true) : undefined}
    >
      {route === 'inbox' ? (
        <Inbox
          focusNoteId={focusedNoteId}
          onFocusNoteHandled={() => setFocusedNoteId(null)}
          // The Cmd-K palette still has an "Agent Runs" navigate command;
          // pass the route action through so it works from the inbox.
          onNavigateToAgentRuns={() => setRoute('agent-runs')}
          onNavigateToRepositories={() => setRoute('repositories')}
          onNavigateToSettings={() => setRoute('settings')}
          paletteOpen={paletteOpen}
          onPaletteOpenChange={setPaletteOpen}
        />
      ) : (
        <AgentRuns
          onOpenSourceNote={(noteId) => {
            setFocusedNoteId(noteId)
            setRoute('inbox')
          }}
        />
      )}
    </AppShell>
  )
}

export default App
