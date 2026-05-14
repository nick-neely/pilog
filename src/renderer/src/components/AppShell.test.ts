import type { AppUpdateStatus } from '@shared/ipc'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from './ui/tooltip'
import { AppShell } from './AppShell'

describe('AppShell update indicator', () => {
  it('renders a subtle update availability control in app chrome', () => {
    const html = renderShell(status({ state: 'available', updateVersion: '1.1.0' }))

    expect(html).toContain('data-testid="open-software-updates"')
    expect(html).toContain('Update available')
    expect(html).toContain('aria-label="Update 1.1.0 available. Open Software updates."')
  })

  it('renders a restart-ready control in app chrome', () => {
    const html = renderShell(status({ state: 'downloaded', updateVersion: '1.1.0' }))

    expect(html).toContain('data-testid="open-software-updates"')
    expect(html).toContain('Restart ready')
    expect(html).toContain('aria-label="Update 1.1.0 ready to install. Open Software updates."')
  })

  it.each(['idle', 'checking', 'not-available', 'disabled', 'error'] as const)(
    'does not render app chrome for %s update state',
    (state) => {
      expect(renderShell(status({ state }))).not.toContain('open-software-updates')
    }
  )
})

function renderShell(updateStatus: AppUpdateStatus): string {
  return renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(
        AppShell,
        {
          tabs: [{ value: 'inbox', label: 'Inbox' }],
          activeTab: 'inbox',
          onTabChange: vi.fn(),
          onNavigateToSettings: vi.fn(),
          updateStatus
        },
        createElement('main', null, 'Content')
      )
    )
  )
}

function status(patch: Partial<AppUpdateStatus>): AppUpdateStatus {
  return {
    state: 'idle',
    version: '1.0.0',
    channel: 'stable',
    channelLabel: 'Stable',
    updateVersion: null,
    lastCheckedAt: null,
    errorMessage: null,
    disabledReason: null,
    ...patch
  }
}
