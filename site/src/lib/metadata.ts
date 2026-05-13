import type { Metadata, MetadataRoute } from 'next'
import { createElement } from 'react'
import type { ReactElement } from 'react'
import type { ReleaseManifest } from './release-manifest'
import rawManifest from '../data/release-manifest.json'

const SITE_URL = 'https://pilog.dev'
const SITE_NAME = 'Pilog'
const DEFAULT_DESCRIPTION =
  'Pilog is the Public Download Path for a local-first developer journal that captures rough notes and turns them into GitHub-ready issues.'

const OPEN_GRAPH_IMAGE = {
  url: '/pi-icon.png',
  width: 1000,
  height: 1000,
  alt: 'Pilog, a local-first developer journal'
}

const PUBLIC_SITEMAP_ROUTES = [
  {
    path: '/',
    changeFrequency: 'weekly',
    priority: 1
  },
  {
    path: '/download',
    changeFrequency: 'weekly',
    priority: 0.9
  },
  {
    path: '/docs',
    changeFrequency: 'monthly',
    priority: 0.7
  },
  {
    path: '/about',
    changeFrequency: 'yearly',
    priority: 0.5
  }
] satisfies ReadonlyArray<{
  readonly path: string
  readonly changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']
  readonly priority: number
}>

type JsonLdNode = Record<string, unknown>

export type JsonLdGraph = {
  readonly '@context': 'https://schema.org'
  readonly '@graph': readonly JsonLdNode[]
}

const manifest = rawManifest as ReleaseManifest

function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString()
}

function jsonLdGraph(nodes: readonly JsonLdNode[]): JsonLdGraph {
  return {
    '@context': 'https://schema.org',
    '@graph': nodes
  }
}

function breadcrumb(pageName: string, pagePath: string): JsonLdNode {
  const pageUrl = absoluteUrl(pagePath)

  return {
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: SITE_NAME,
        item: absoluteUrl('/')
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: pageName,
        item: pageUrl
      }
    ]
  }
}

function pilogSoftwareIdentity(): JsonLdNode {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#software`,
    name: SITE_NAME,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Desktop',
    url: absoluteUrl('/'),
    downloadUrl: absoluteUrl('/download'),
    description:
      'Pilog is a local-first desktop app for capturing rough development notes and producing repo-aware GitHub issue drafts.'
  }
}

function currentReleaseSoftwareIdentity(): JsonLdNode {
  const channel = manifest.stable ?? manifest.preview
  const software = pilogSoftwareIdentity()

  if (channel === null) return software

  return {
    ...software,
    softwareVersion: channel.version,
    releaseNotes: channel.releaseUrl
  }
}

function pageNode(type: string, idPath: string, name: string, description: string): JsonLdNode {
  const pageUrl = absoluteUrl(idPath)

  return {
    '@type': type,
    '@id': `${pageUrl}#webpage`,
    name,
    url: pageUrl,
    description,
    isPartOf: {
      '@id': `${SITE_URL}/#website`
    }
  }
}

type PageMetadataOptions = {
  readonly title: string
  readonly description: string
  readonly canonical: string
  readonly openGraphTitle: string
  readonly openGraphDescription?: string
  readonly robots?: Metadata['robots']
}

function createPageMetadata({
  title,
  description,
  canonical,
  openGraphTitle,
  openGraphDescription = description,
  robots
}: PageMetadataOptions): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical
    },
    ...(robots ? { robots } : {}),
    openGraph: {
      url: canonical,
      title: openGraphTitle,
      description: openGraphDescription
    }
  }
}

export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  appleWebApp: {
    capable: true,
    title: SITE_NAME
  },
  title: {
    default: 'Pilog: Local-first developer journal',
    template: `%s | ${SITE_NAME}`
  },
  description: DEFAULT_DESCRIPTION,
  authors: [{ name: 'Nick Neely', url: 'https://github.com/nick-neely' }],
  creator: 'Nick Neely',
  publisher: 'Pilog',
  alternates: {
    canonical: '/'
  },
  robots: {
    index: true,
    follow: true
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon0.svg', type: 'image/svg+xml' },
      { url: '/icon1.png', type: 'image/png' }
    ],
    apple: [{ url: '/apple-icon.png', type: 'image/png' }]
  },
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: SITE_NAME,
    title: 'Pilog: Local-first developer journal',
    description: DEFAULT_DESCRIPTION,
    images: [OPEN_GRAPH_IMAGE]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pilog: Local-first developer journal',
    description: DEFAULT_DESCRIPTION,
    images: [OPEN_GRAPH_IMAGE.url]
  }
}

export const homeMetadata: Metadata = createPageMetadata({
  title: 'Home',
  description:
    'Capture rough development notes in a global-hotkey scratchpad, then triage them into repo-aware GitHub issue drafts when you are ready.',
  canonical: '/',
  openGraphTitle: 'Pilog: Local-first developer journal',
  openGraphDescription:
    'Capture rough development notes in a global-hotkey scratchpad, then triage them into repo-aware GitHub issue drafts.'
})

export const downloadMetadata: Metadata = createPageMetadata({
  title: 'Download',
  description:
    'Download the stable Pilog desktop app for macOS, Windows, and Linux from the public release path at pilog.dev.',
  canonical: '/download',
  openGraphTitle: 'Download Pilog'
})

export const docsMetadata: Metadata = createPageMetadata({
  title: 'Docs',
  description:
    'Install Pilog, connect GitHub, configure the Pi draft agent, and turn rough notes into clean GitHub issues without leaving flow.',
  canonical: '/docs',
  openGraphTitle: 'Pilog Docs',
  openGraphDescription:
    'Install Pilog, connect GitHub, configure the Pi draft agent, and turn rough notes into clean GitHub issues.'
})

export const aboutMetadata: Metadata = createPageMetadata({
  title: 'About',
  description:
    'Learn why Pilog is local-first by default, how capture stays separate from triage, and how the open source project is maintained.',
  canonical: '/about',
  openGraphTitle: 'About Pilog'
})

export const previewMetadata: Metadata = createPageMetadata({
  title: 'Preview Downloads',
  description:
    'Download unsigned Pilog preview builds for testing only. Preview builds are pre-release software and are not the stable Public Download Path.',
  canonical: '/preview',
  robots: {
    index: false,
    follow: false
  },
  openGraphTitle: 'Pilog Preview Downloads',
  openGraphDescription:
    'Download unsigned Pilog preview builds for testing only. Preview builds are not the stable Public Download Path.'
})

export function createRobots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/'
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL
  }
}

export function createSitemap(): MetadataRoute.Sitemap {
  return PUBLIC_SITEMAP_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: new URL(path, SITE_URL).toString(),
    changeFrequency,
    priority
  }))
}

export const homeStructuredData: JsonLdGraph = jsonLdGraph([
  {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: absoluteUrl('/'),
    description: DEFAULT_DESCRIPTION,
    publisher: {
      '@id': `${SITE_URL}/#organization`
    }
  },
  {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: absoluteUrl('/'),
    sameAs: ['https://github.com/nick-neely/pilog']
  },
  pageNode(
    'WebPage',
    '/',
    'Pilog',
    'Capture rough development notes and triage them into repo-aware GitHub issue drafts.'
  ),
  pilogSoftwareIdentity()
])

export const downloadStructuredData: JsonLdGraph = jsonLdGraph([
  pageNode(
    'WebPage',
    '/download',
    'Download Pilog',
    'Download Pilog desktop releases from the public download path.'
  ),
  breadcrumb('Download', '/download'),
  currentReleaseSoftwareIdentity()
])

export const docsStructuredData: JsonLdGraph = jsonLdGraph([
  {
    '@type': 'TechArticle',
    '@id': `${SITE_URL}/docs#documentation`,
    name: 'Pilog Docs',
    url: absoluteUrl('/docs'),
    description:
      'Install Pilog, connect GitHub, configure the Pi draft agent, and turn rough notes into clean GitHub issues.',
    isPartOf: {
      '@id': `${SITE_URL}/#website`
    },
    about: {
      '@id': `${SITE_URL}/#software`
    }
  },
  breadcrumb('Docs', '/docs')
])

export const aboutStructuredData: JsonLdGraph = jsonLdGraph([
  pageNode(
    'AboutPage',
    '/about',
    'About Pilog',
    'Learn why Pilog is local-first by default and how the open source project is maintained.'
  ),
  breadcrumb('About', '/about')
])

export function JsonLdScript({ data }: { readonly data: JsonLdGraph }): ReactElement {
  return createElement('script', {
    type: 'application/ld+json',
    dangerouslySetInnerHTML: { __html: JSON.stringify(data) }
  })
}
