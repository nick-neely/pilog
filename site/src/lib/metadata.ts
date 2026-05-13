import type { Metadata } from 'next'

const SITE_URL = 'https://pilog.dev'
const SITE_NAME = 'Pilog'
const ROOT_TITLE = 'Pilog: Local-first developer journal'
const DEFAULT_DESCRIPTION =
  'Pilog is the Public Download Path for a local-first developer journal that captures rough notes and turns them into GitHub-ready issues.'

const PREVIEW_IMAGE_DETAILS = {
  width: 1200,
  height: 630,
  alt: 'Pilog preview: a warm parchment note stack with a Reading-Room Moss pi mark'
}

const OPEN_GRAPH_PREVIEW_IMAGE = {
  url: '/opengraph-image.jpg',
  ...PREVIEW_IMAGE_DETAILS
}

const TWITTER_PREVIEW_IMAGE = {
  url: '/twitter-image.jpg',
  ...PREVIEW_IMAGE_DETAILS
}

type PageMetadataOptions = {
  readonly title: string
  readonly description: string
  readonly canonical: string
  readonly openGraphTitle: string
  readonly openGraphDescription?: string
  readonly robots?: Metadata['robots']
}

type SocialPreviewMetadataOptions = {
  readonly url: string
  readonly title: string
  readonly description: string
}

function createSocialPreviewMetadata({
  url,
  title,
  description
}: SocialPreviewMetadataOptions): Pick<Metadata, 'openGraph' | 'twitter'> {
  return {
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url,
      siteName: SITE_NAME,
      title,
      description,
      images: [OPEN_GRAPH_PREVIEW_IMAGE]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [TWITTER_PREVIEW_IMAGE]
    }
  }
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
    ...createSocialPreviewMetadata({
      url: canonical,
      title: openGraphTitle,
      description: openGraphDescription
    })
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
    default: ROOT_TITLE,
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
  ...createSocialPreviewMetadata({
    url: '/',
    title: ROOT_TITLE,
    description: DEFAULT_DESCRIPTION
  })
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
