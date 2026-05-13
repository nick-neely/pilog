import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import rawReleaseManifest from '../site/src/data/release-manifest.json'
import {
  aboutMetadata,
  aboutStructuredData,
  createRobots,
  createSitemap,
  docsMetadata,
  docsStructuredData,
  downloadMetadata,
  downloadStructuredData,
  homeMetadata,
  homeStructuredData,
  previewMetadata,
  rootMetadata
} from '../site/src/lib/metadata'
import type { ReleaseManifest } from '../site/src/lib/release-manifest'

const releaseManifest = rawReleaseManifest as ReleaseManifest
const currentReleaseChannel = releaseManifest.stable ?? releaseManifest.preview

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

  it('publishes crawler discovery for public site routes', () => {
    const sitemap = createSitemap()

    expect(createRobots()).toEqual({
      rules: {
        userAgent: '*',
        allow: '/'
      },
      sitemap: 'https://pilog.dev/sitemap.xml',
      host: 'https://pilog.dev'
    })

    expect(sitemap).toEqual([
      {
        url: 'https://pilog.dev/',
        changeFrequency: 'weekly',
        priority: 1
      },
      {
        url: 'https://pilog.dev/download',
        changeFrequency: 'weekly',
        priority: 0.9
      },
      {
        url: 'https://pilog.dev/docs',
        changeFrequency: 'monthly',
        priority: 0.7
      },
      {
        url: 'https://pilog.dev/about',
        changeFrequency: 'yearly',
        priority: 0.5
      }
    ])
    expect(sitemap.map((entry) => entry.url)).not.toContain('https://pilog.dev/preview')
  })

  it('describes the home page website and Pilog software with stable URLs', () => {
    expect(homeStructuredData).toEqual({
      '@context': 'https://schema.org',
      '@graph': expect.arrayContaining([
        expect.objectContaining({
          '@type': 'WebSite',
          '@id': 'https://pilog.dev/#website',
          name: 'Pilog',
          url: 'https://pilog.dev/'
        }),
        expect.objectContaining({
          '@type': 'SoftwareApplication',
          '@id': 'https://pilog.dev/#software',
          name: 'Pilog',
          applicationCategory: 'DeveloperApplication',
          operatingSystem: 'Desktop',
          url: 'https://pilog.dev/',
          downloadUrl: 'https://pilog.dev/download',
          description:
            'Pilog is a local-first desktop app for capturing rough development notes and producing repo-aware GitHub issue drafts.'
        })
      ])
    })
  })

  it('keeps download software data aligned to current release posture', () => {
    const graph = downloadStructuredData['@graph']
    const page = graph.find((node) => node['@id'] === 'https://pilog.dev/download#webpage')
    const software = graph.find((node) => node['@id'] === 'https://pilog.dev/#software')

    expect(page).toMatchObject({
      '@type': 'WebPage',
      name: 'Download Pilog',
      url: 'https://pilog.dev/download'
    })
    if (currentReleaseChannel) {
      expect(software).toMatchObject({
        '@type': 'SoftwareApplication',
        name: 'Pilog',
        softwareVersion: currentReleaseChannel.version,
        releaseNotes: currentReleaseChannel.releaseUrl
      })
    } else {
      expect(software).toMatchObject({
        '@type': 'SoftwareApplication',
        name: 'Pilog'
      })
      expect(software).not.toHaveProperty('softwareVersion')
      expect(software).not.toHaveProperty('releaseNotes')
    }
    expect(software).not.toHaveProperty('offers')
    expect(software).not.toHaveProperty('aggregateRating')
  })

  it('uses page-appropriate structured data on docs and about', () => {
    expect(docsStructuredData['@graph']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'TechArticle',
          '@id': 'https://pilog.dev/docs#documentation',
          name: 'Pilog Docs'
        }),
        expect.objectContaining({
          '@type': 'BreadcrumbList',
          '@id': 'https://pilog.dev/docs#breadcrumb'
        })
      ])
    )

    expect(aboutStructuredData['@graph']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'AboutPage',
          '@id': 'https://pilog.dev/about#webpage',
          name: 'About Pilog'
        }),
        expect.objectContaining({
          '@type': 'BreadcrumbList',
          '@id': 'https://pilog.dev/about#breadcrumb'
        })
      ])
    )
  })
})
