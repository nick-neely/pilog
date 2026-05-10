export function SaveButton(props: { pending: boolean; onSave: () => void }): string {
  return props.pending ? 'Saving...' : 'SaveButton ready'
}
