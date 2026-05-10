import type { IpcRequest, IpcResponse } from '@shared/ipc'
import { app, ipcMain } from 'electron'
import type { PilogDatabase } from '../db/client'
import { countRunsByStatus, getRunById, listRuns } from '../db/repositories/agent-runs'
import {
  listIssueDraftsForReview,
  mergeIssueDrafts,
  splitIssueDraft,
  updateIssueDraft,
  updateIssueDraftStatus
} from '../db/repositories/issue-drafts'
import {
  countNotesByStatus,
  createNote,
  deleteNote,
  listNotes,
  updateNote
} from '../db/repositories/notes'
import { listPublishAuditLog } from '../db/repositories/publish-log'
import {
  getOnboardingState,
  getSetting,
  setOnboardingState,
  setSetting
} from '../db/repositories/settings'
import { pathActions } from '../file-actions'

type DbChannel =
  | 'agent-runs:get'
  | 'agent-runs:list'
  | 'agent-runs:counts'
  | 'issue-drafts:list'
  | 'issue-drafts:merge'
  | 'issue-drafts:split'
  | 'issue-drafts:update'
  | 'issue-drafts:updateStatus'
  | 'note:create'
  | 'note:list'
  | 'note:counts'
  | 'note:update'
  | 'note:delete'
  | 'onboarding:get'
  | 'onboarding:set'
  | 'path:copy'
  | 'path:reveal'
  | 'publish-log:list'
  | 'setting:get'
  | 'setting:set'

type Handler<C extends DbChannel> = (
  db: PilogDatabase,
  request: IpcRequest<C>
) => IpcResponse<C> | Promise<IpcResponse<C>>

const ISSUE_DRAFT_CHANGE_CHANNELS = new Set<DbChannel>([
  'issue-drafts:merge',
  'issue-drafts:split',
  'issue-drafts:update',
  'issue-drafts:updateStatus'
])

const handlers: { [C in DbChannel]: Handler<C> } = {
  'agent-runs:get': (db, request) => getRunById(db, request.id),
  'agent-runs:list': (db, request) => listRuns(db, request),
  'agent-runs:counts': (db) => countRunsByStatus(db),
  'issue-drafts:list': (db, request) => listIssueDraftsForReview(db, request),
  'issue-drafts:merge': (db, request) => mergeIssueDrafts(db, request),
  'issue-drafts:split': (db, request) => splitIssueDraft(db, request),
  'issue-drafts:update': (db, request) => updateIssueDraft(db, request),
  'issue-drafts:updateStatus': (db, request) => updateIssueDraftStatus(db, request),
  'note:create': (db, request) => createNote(db, request),
  'note:list': (db, request) => listNotes(db, request),
  'note:counts': (db, request) => countNotesByStatus(db, request),
  'note:update': (db, request) => updateNote(db, request),
  'note:delete': (db, request) => deleteNote(db, request),
  'onboarding:get': (db) => getOnboardingState(db),
  'onboarding:set': (db, request) => setOnboardingState(db, request),
  'path:copy': (_db, request) => pathActions.copyPath(request),
  'path:reveal': (_db, request) => pathActions.revealPath(request),
  'publish-log:list': (db, request) => listPublishAuditLog(db, request),
  'setting:get': (db, request) => getSetting(db, request.key),
  'setting:set': (db, request) => {
    setSetting(db, request.key, request.value)
    if (request.key === 'openInboxAtLogin') {
      app.setLoginItemSettings({ openAtLogin: request.value === 'true' })
    }
  }
}

export function registerIpcHandlers(
  db: PilogDatabase,
  options?: { onNoteCreated?: () => void; onIssueDraftsChanged?: () => void }
): void {
  for (const channel of Object.keys(handlers) as DbChannel[]) {
    ipcMain.handle(channel, (_event, request) => {
      const handler = handlers[channel] as Handler<typeof channel>
      const result = handler(db, request)
      if (channel === 'note:create') options?.onNoteCreated?.()
      if (ISSUE_DRAFT_CHANGE_CHANNELS.has(channel)) {
        options?.onIssueDraftsChanged?.()
      }
      return result
    })
  }
}
