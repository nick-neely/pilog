import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('site theme integration', () => {
  it('wraps the Next.js site with the next-themes class provider', () => {
    const layout = read('site/src/app/layout.tsx')
    const provider = read('site/src/components/theme-provider.tsx')

    expect(provider).toContain("import { ThemeProvider as NextThemesProvider } from 'next-themes'")
    expect(provider).toContain('React.ComponentProps<typeof NextThemesProvider>')
    expect(layout).toContain('<html lang="en" suppressHydrationWarning>')
    expect(layout).toContain('<ThemeProvider')
    expect(layout).toContain('attribute="class"')
    expect(layout).toContain('defaultTheme="system"')
    expect(layout).toContain('enableSystem')
    expect(layout).toContain('disableTransitionOnChange')
  })

  it('exposes light, dark, and auto theme choices in the site header', () => {
    const selector = read('site/src/components/theme-selector.tsx')
    const header = read('site/src/components/site-header.tsx')

    expect(header).toContain('<ThemeSelector />')
    expect(selector).toContain("type ThemeChoice = 'light' | 'dark' | 'system'")
    expect(selector).toContain("setTheme(choice.id)")
    expect(selector).toContain('aria-label="Theme"')
    expect(selector).toContain('Light')
    expect(selector).toContain('Dark')
    expect(selector).toContain('Auto')
  })
})
