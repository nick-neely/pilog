import type { RepoAutoPublishSettings } from '@shared/ipc'

export function autoPublishSettingsSummary(settings: RepoAutoPublishSettings): string {
  const state = settings.autoPublishEnabled ? 'on' : 'off'
  const files = settings.autoPublishRequireKnownAffectedFiles
    ? 'known files required'
    : 'unknown files allowed'
  return `Auto-publish ${state}, ${settings.autoPublishMinimumConfidence} confidence, ${files}.`
}
