export function useIssueDraft(): { save: () => Promise<void>; error: string | null } {
  return {
    save: async () => undefined,
    error: null
  }
}
