export function ActivitySummary(props: {
  successfulImportedRows: number
  failedImportedRows: number
}): string {
  return `Imported ${props.successfulImportedRows} items`
}
