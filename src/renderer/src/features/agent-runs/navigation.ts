export type RunNavigationOrigin =
  | { kind: 'note'; noteId: string }
  | { kind: 'draft'; draftId: string; label: string }
  | { kind: 'drafts'; label?: string }
  | { kind: 'history' }
