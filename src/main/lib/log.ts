export const log = {
  info: (...args: unknown[]): void => console.log('[pilog]', ...args),
  warn: (...args: unknown[]): void => console.warn('[pilog]', ...args),
  error: (...args: unknown[]): void => console.error('[pilog]', ...args)
}
