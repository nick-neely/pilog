import type { RepoPrivacySettings } from '@shared/ipc'

export const DIFF_SUMMARY_PRIVACY_COPY =
  'When enabled, new notes for this repo may store a small summary of local diff size, such as changed file, insertion, and deletion counts. Raw diff contents are not stored.'

export function repoPrivacySummary(settings: RepoPrivacySettings): string {
  return settings.allowDiffSummaryCapture ? 'Diff summaries on.' : 'Diff summaries off.'
}
