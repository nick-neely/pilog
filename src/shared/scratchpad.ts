export function shouldSave(content: string, hasChanged: boolean): boolean {
  return content.trim().length > 0 && hasChanged
}
