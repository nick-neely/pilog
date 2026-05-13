import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  aboutMetadata,
  docsMetadata,
  downloadMetadata,
  homeMetadata,
  previewMetadata,
  rootMetadata
} from '../site/src/lib/metadata'

const previewImageDetails = {
  width: 1200,
  height: 630,
  alt: 'Pilog preview: a warm parchment note stack with a Reading-Room Moss pi mark'
}

const openGraphPreviewImage = {
  url: '/opengraph-image.jpg',
  ...previewImageDetails
}

const twitterPreviewImage = {
  url: '/twitter-image.jpg',
  ...previewImageDetails
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

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
    expect(rootMetadata.openGraph).toMatchObject({
      type: 'website',
      locale: 'en_US',
      url: '/',
      siteName: 'Pilog',
      title: 'Pilog: Local-first developer journal',
      description: rootMetadata.description,
      images: [openGraphPreviewImage]
    })
    expect(rootMetadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'Pilog: Local-first developer journal',
      description: rootMetadata.description,
      images: [twitterPreviewImage]
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

  it('gives indexable public routes complete Open Graph and Twitter preview metadata', () => {
    const indexableRoutes = [homeMetadata, downloadMetadata, docsMetadata, aboutMetadata]

    for (const metadata of indexableRoutes) {
      expect(metadata.openGraph).toMatchObject({
        type: 'website',
        locale: 'en_US',
        url: metadata.alternates?.canonical,
        siteName: 'Pilog',
        title: expect.any(String),
        description: expect.any(String),
        images: [openGraphPreviewImage]
      })
      expect(metadata.twitter).toMatchObject({
        card: 'summary_large_image',
        title: expect.any(String),
        description: expect.any(String),
        images: [twitterPreviewImage]
      })
    }
  })

  it('serves the selected branded preview image through Next metadata image conventions', () => {
    const selectedImage = 'design/og-image/pilog-og-option-01-optimized.jpg'

    expect(sha256('site/src/app/opengraph-image.jpg')).toBe(sha256(selectedImage))
    expect(sha256('site/src/app/twitter-image.jpg')).toBe(sha256(selectedImage))
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
