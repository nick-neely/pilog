import { useEffect, useState, useSyncExternalStore } from 'react'
import { AppShell } from './components/AppShell'
import { GlobalCommandPalette } from './components/GlobalCommandPalette'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from './components/ui/breadcrumb'
import { Inbox } from './features/inbox/Inbox'
import { Settings } from './features/settings/Settings'
import { Repositories } from './features/repositories/Repositories'
import { AgentRuns } from './features/agent-runs/AgentRuns'
import { DraftReview } from './features/issue-drafts/DraftReview'
import { PublishLog } from './features/publish-log/PublishLog'
import type { RunNavigationOrigin } from './features/agent-runs/navigation'
import { PILOG_APP_SHORTCUTS, usePilogHotkey } from './shortcuts/pilog-hotkeys'
import type { AppUpdateStatus } from '@shared/ipc'

type Route = 'inbox' | 'draft-review' | 'settings' | 'repositories' | 'agent-runs' | 'publish-log'
type ViewTabValue = 'inbox' | 'drafts'

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
    value: 'drafts' as const,
    label: 'Drafts',
    testId: 'view-tab-drafts-trigger',
    activeTestId: 'view-tab-drafts'
  }
]

function routeToActiveTab(route: Route): ViewTabValue | null {
  switch (route) {
    case 'inbox':
      return 'inbox'
    case 'draft-review':
      return 'drafts'
    case 'agent-runs':
    case 'publish-log':
    case 'repositories':
    case 'settings':
      return null
  }
}

function tabToRoute(tab: string): Route {
  switch (tab) {
    case 'inbox':
      return 'inbox'
    case 'drafts':
      return 'draft-review'
    default:
      return 'inbox'
  }
}

function RunBreadcrumbs({
  origin,
  focusedRunId,
  onOpenInbox,
  onOpenDrafts,
  onOpenRunHistory,
  onOpenNote,
  onOpenDraft
}: {
  origin: RunNavigationOrigin | null
  focusedRunId: string | null
  onOpenInbox: () => void
  onOpenDrafts: () => void
  onOpenRunHistory: () => void
  onOpenNote: (noteId: string) => void
  onOpenDraft: (draftId: string) => void
}): React.JSX.Element {
  const currentRunLabel = focusedRunId ? 'Run' : 'Run history'

  if (origin?.kind === 'note') {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button type="button" onClick={onOpenInbox}>
                Inbox
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button type="button" onClick={() => onOpenNote(origin.noteId)}>
                Note
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{currentRunLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  if (origin?.kind === 'draft') {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button type="button" onClick={onOpenDrafts}>
                Drafts
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button type="button" onClick={() => onOpenDraft(origin.draftId)}>
                {origin.label}
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{currentRunLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  if (origin?.kind === 'drafts') {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button type="button" onClick={onOpenDrafts}>
                Drafts
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{origin.label ?? currentRunLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {focusedRunId ? (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <button type="button" onClick={onOpenRunHistory}>
                  Run history
                </button>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Run</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : (
          <BreadcrumbItem>
            <BreadcrumbPage>Run history</BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function App(): React.JSX.Element {
  const route = useSyncExternalStore(subscribeRoute, getRouteSnapshot)
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null)
  const [focusedRunId, setFocusedRunId] = useState<string | null>(null)
  const [focusedDraftId, setFocusedDraftId] = useState<string | null>(null)
  const [runOrigin, setRunOrigin] = useState<RunNavigationOrigin | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null)

  useEffect(() => {
    let mounted = true
    window.pilog.invoke('app-updates:getStatus').then((next) => {
      if (mounted) setUpdateStatus(next)
    })
    const unsubscribe = window.pilog.onUpdateStatus((next) => {
      setUpdateStatus(next)
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  usePilogHotkey(PILOG_APP_SHORTCUTS.commandPalette, () => {
    setPaletteOpen((open) => !open)
  })
  usePilogHotkey(PILOG_APP_SHORTCUTS.openInbox, () => setAppRoute('inbox'))
  usePilogHotkey(PILOG_APP_SHORTCUTS.openDrafts, () => setAppRoute('draft-review'))

  const openInbox = (): void => setAppRoute('inbox')
  const openDrafts = (): void => setAppRoute('draft-review')
  const openSettings = (): void => setAppRoute('settings')
  const openNote = (noteId: string): void => {
    setFocusedNoteId(noteId)
    setAppRoute('inbox')
  }
  const openDraft = (draftId: string): void => {
    setFocusedDraftId(draftId)
    setAppRoute('draft-review')
  }
  const openRunHistory = (): void => {
    setFocusedRunId(null)
    setRunOrigin({ kind: 'history' })
    setAppRoute('agent-runs')
  }
  const openAgentRun = (runId?: string, origin?: RunNavigationOrigin): void => {
    setFocusedRunId(runId ?? null)
    setRunOrigin(origin ?? { kind: 'history' })
    setAppRoute('agent-runs')
  }
  const createNoteFromPalette = async (): Promise<void> => {
    const created = await window.pilog.invoke('note:create', { content: '' })
    openNote(created.id)
  }

  if (route === 'settings') {
    return (
      <>
        <Settings
          onBack={openInbox}
          onNavigateRepositories={() => setAppRoute('repositories')}
          onNavigateRunHistory={openRunHistory}
          onNavigatePublishLog={() => setAppRoute('publish-log')}
        />
        <GlobalCommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          activeRoute={route}
          onCreateNote={createNoteFromPalette}
          onOpenInbox={openInbox}
          onOpenDrafts={openDrafts}
          onOpenRunHistory={openRunHistory}
          onOpenSettings={openSettings}
          onOpenNote={openNote}
          onOpenDraft={openDraft}
        />
      </>
    )
  }

  if (route === 'repositories') {
    return (
      <>
        <Repositories onBack={openSettings} onNavigateSettings={openSettings} />
        <GlobalCommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          activeRoute={route}
          onCreateNote={createNoteFromPalette}
          onOpenInbox={openInbox}
          onOpenDrafts={openDrafts}
          onOpenRunHistory={openRunHistory}
          onOpenSettings={openSettings}
          onOpenNote={openNote}
          onOpenDraft={openDraft}
        />
      </>
    )
  }

  const activeTab = routeToActiveTab(route)
  const runBreadcrumbs =
    route === 'agent-runs' ? (
      <RunBreadcrumbs
        origin={runOrigin}
        focusedRunId={focusedRunId}
        onOpenInbox={openInbox}
        onOpenDrafts={openDrafts}
        onOpenRunHistory={openRunHistory}
        onOpenNote={openNote}
        onOpenDraft={openDraft}
      />
    ) : undefined
  const publishLogBreadcrumbs =
    route === 'publish-log' ? (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button type="button" onClick={openSettings}>
                Settings
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Publish log</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    ) : undefined

  return (
    <AppShell
      tabs={VIEW_TABS}
      activeTab={activeTab ?? undefined}
      onTabChange={(next) => setAppRoute(tabToRoute(next))}
      onNavigateToSettings={openSettings}
      navigationSlot={runBreadcrumbs ?? publishLogBreadcrumbs}
      onOpenCommandPalette={() => setPaletteOpen(true)}
      updateStatus={updateStatus}
    >
      {route === 'inbox' ? (
        <Inbox
          focusNoteId={focusedNoteId}
          onFocusNoteHandled={() => setFocusedNoteId(null)}
          onNavigateToAgentRuns={openAgentRun}
          onNavigateToRepositories={() => setAppRoute('repositories')}
          onNavigateToSettings={openSettings}
          onNavigateToDraftReview={(draftId) => {
            if (draftId) openDraft(draftId)
            else openDrafts()
          }}
        />
      ) : route === 'draft-review' ? (
        <DraftReview
          focusDraftId={focusedDraftId}
          onFocusDraftHandled={() => setFocusedDraftId(null)}
          onNavigateToInbox={openInbox}
          onNavigateToAgentRuns={openAgentRun}
          onNavigateToSettings={openSettings}
          onNavigateToRepositories={() => setAppRoute('repositories')}
          onOpenSourceNote={openNote}
        />
      ) : route === 'publish-log' ? (
        <PublishLog onOpenDraft={openDraft} onOpenSourceNote={openNote} />
      ) : (
        <AgentRuns focusRunId={focusedRunId} onOpenSourceNote={openNote} />
      )}
      <GlobalCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        activeRoute={route}
        onCreateNote={createNoteFromPalette}
        onOpenInbox={openInbox}
        onOpenDrafts={openDrafts}
        onOpenRunHistory={openRunHistory}
        onOpenSettings={openSettings}
        onOpenNote={openNote}
        onOpenDraft={openDraft}
      />
    </AppShell>
  )
}

export default App
