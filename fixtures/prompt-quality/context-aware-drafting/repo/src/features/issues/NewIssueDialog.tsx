export function NewIssueDialog(props: {
  selectedRepoId: string | null
  saveError: string | null
}): string {
  if (props.saveError) return `Retry issue for ${props.selectedRepoId ?? 'no repo'}`
  return props.selectedRepoId ? `New issue for ${props.selectedRepoId}` : 'Choose a repo'
}
