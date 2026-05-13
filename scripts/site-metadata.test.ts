import { describe, expect, it } from 'vitest'
import {
  aboutMetadata,
  docsMetadata,
  downloadMetadata,
  homeMetadata,
  previewMetadata,
  rootMetadata
} from '../site/src/lib/metadata'

describe('site metadata', () => {
  it('defines branded root defaults for public Pilog pages', () => {
    expect(rootMetadata.metadataBase?.toString()).toBe('https://pilog.dev/')
    expect(rootMetadata.applicationName).toBe('Pilog')
    expect(rootMetadata.title).toEqual({
      default: 'Pilog: Local-first developer journal',
      template: '%s | Pilog'
    })
    expect(rootMetadata.description).toContain('Public Download Path')
    expect(rootMetadata.alternates).toEqual({ canonical: '/' })
    expect(rootMetadata.robots).toEqual({
      index: true,
      follow: true
    })
    expect(rootMetadata.icons).toEqual({
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/icon0.svg', type: 'image/svg+xml' },
        { url: '/icon1.png', type: 'image/png' }
      ],
      apple: [{ url: '/apple-icon.png', type: 'image/png' }]
    })
  })

  it('gives each indexable public route a specific canonical title and description', () => {
    expect(homeMetadata).toMatchObject({
      title: 'Home',
      alternates: { canonical: '/' }
    })
    expect(homeMetadata.description).toContain('global-hotkey scratchpad')

    expect(downloadMetadata).toMatchObject({
      title: 'Download',
      alternates: { canonical: '/download' }
    })
    expect(downloadMetadata.description).toContain('stable Pilog desktop app')

    expect(docsMetadata).toMatchObject({
      title: 'Docs',
      alternates: { canonical: '/docs' }
    })
    expect(docsMetadata.description).toContain('connect GitHub')

    expect(aboutMetadata).toMatchObject({
      title: 'About',
      alternates: { canonical: '/about' }
    })
    expect(aboutMetadata.description).toContain('local-first')
  })

  it('keeps preview downloads out of the index', () => {
    expect(previewMetadata).toMatchObject({
      title: 'Preview Downloads',
      alternates: { canonical: '/preview' },
      robots: {
        index: false,
        follow: false
      }
    })
    expect(previewMetadata.description).toContain('unsigned')
  })
})
