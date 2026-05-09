import { useState, useSyncExternalStore } from 'react'
import { AppShell } from './components/AppShell'
import { Inbox } from './features/inbox/Inbox'
import { Settings } from './features/settings/Settings'
import { Repositories } from './features/repositories/Repositories'
import { AgentRuns } from './features/agent-runs/AgentRuns'
import { DraftReview } from './features/issue-drafts/DraftReview'

type Route = 'inbox' | 'draft-review' | 'settings' | 'repositories' | 'agent-runs'
type ViewTabValue = 'inbox' | 'drafts' | 'runs'

let currentRoute: Route = 'inbox'
const routeListeners = new Set<() => void>()

function setAppRoute(next: Route): void {
  if (currentRoute === next) return
  currentRoute = next
  routeListeners.forEach((listener) => listener())
}

function subscribeRoute(listener: () => void): () => void {
  routeListeners.add(listener)
  const unsubInbox = window.pilog.on('navigate:inbox', () => setAppRoute('inbox'))
  const unsubSettings = window.pilog.on('navigate:settings', () => setAppRoute('settings'))
  return () => {
    routeListeners.delete(listener)
    unsubInbox()
    unsubSettings()
  }
}

function getRouteSnapshot(): Route {
  return currentRoute
}

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
  },
  {
    value: 'drafts' as const,
    label: 'Drafts',
    testId: 'view-tab-drafts-trigger',
    activeTestId: 'view-tab-drafts'
  }
]

function routeToActiveTab(route: Route): ViewTabValue {
  switch (route) {
    case 'inbox':
      return 'inbox'
    case 'draft-review':
      return 'drafts'
    case 'agent-runs':
    case 'repositories':
    case 'settings':
      return 'runs'
  }
}

function tabToRoute(tab: string): Route {
  switch (tab) {
    case 'inbox':
      return 'inbox'
    case 'drafts':
      return 'draft-review'
    case 'runs':
    default:
      return 'agent-runs'
  }
}

function App(): React.JSX.Element {
  const route = useSyncExternalStore(subscribeRoute, getRouteSnapshot)
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null)
  const [focusedRunId, setFocusedRunId] = useState<string | null>(null)
  // Lifted because the Cmd-K trigger now lives in the global top bar; the
  // palette dialog itself stays inside Inbox where the inbox-specific
  // commands are wired.
  const [paletteOpen, setPaletteOpen] = useState(false)

  if (route === 'settings') {
    return (
      <Settings
        onBack={() => setAppRoute('inbox')}
        onNavigateRepositories={() => setAppRoute('repositories')}
      />
    )
  }

  if (route === 'repositories') {
    return <Repositories onBack={() => setAppRoute('settings')} />
  }

  const activeTab = routeToActiveTab(route)

  return (
    <AppShell
      tabs={VIEW_TABS}
      activeTab={activeTab}
      onTabChange={(next) => setAppRoute(tabToRoute(next))}
      onNavigateToSettings={() => setAppRoute('settings')}
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
          onNavigateToAgentRuns={(runId) => {
            if (runId) setFocusedRunId(runId)
            setAppRoute('agent-runs')
          }}
          onNavigateToRepositories={() => setAppRoute('repositories')}
          onNavigateToSettings={() => setAppRoute('settings')}
          onNavigateToDraftReview={() => setAppRoute('draft-review')}
          paletteOpen={paletteOpen}
          onPaletteOpenChange={setPaletteOpen}
        />
      ) : route === 'draft-review' ? (
        <DraftReview />
      ) : (
        <AgentRuns
          focusRunId={focusedRunId}
          onOpenSourceNote={(noteId) => {
            setFocusedNoteId(noteId)
            setAppRoute('inbox')
          }}
        />
      )}
    </AppShell>
  )
}

export default App
