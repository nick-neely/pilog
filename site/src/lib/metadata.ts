import type { Metadata } from 'next'

const siteUrl = 'https://pilog.dev'
const siteName = 'Pilog'
const defaultDescription =
  'Pilog is the Public Download Path for a local-first developer journal that captures rough notes and turns them into GitHub-ready issues.'

const openGraphImage = {
  url: '/pi-icon.png',
  width: 1000,
  height: 1000,
  alt: 'Pilog, a local-first developer journal'
}

export const rootMetadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  appleWebApp: {
    capable: true,
    title: siteName
  },
  title: {
    default: 'Pilog: Local-first developer journal',
    template: `%s | ${siteName}`
  },
  description: defaultDescription,
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
    siteName,
    title: 'Pilog: Local-first developer journal',
    description: defaultDescription,
    images: [openGraphImage]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pilog: Local-first developer journal',
    description: defaultDescription,
    images: [openGraphImage.url]
  }
}

export const homeMetadata: Metadata = {
  title: 'Home',
  description:
    'Capture rough development notes in a global-hotkey scratchpad, then triage them into repo-aware GitHub issue drafts when you are ready.',
  alternates: {
    canonical: '/'
  },
  openGraph: {
    url: '/',
    title: 'Pilog: Local-first developer journal',
    description:
      'Capture rough development notes in a global-hotkey scratchpad, then triage them into repo-aware GitHub issue drafts.'
  }
}

export const downloadMetadata: Metadata = {
  title: 'Download',
  description:
    'Download the stable Pilog desktop app for macOS, Windows, and Linux from the public release path at pilog.dev.',
  alternates: {
    canonical: '/download'
  },
  openGraph: {
    url: '/download',
    title: 'Download Pilog',
    description:
      'Download the stable Pilog desktop app for macOS, Windows, and Linux from the public release path at pilog.dev.'
  }
}

export const docsMetadata: Metadata = {
  title: 'Docs',
  description:
    'Install Pilog, connect GitHub, configure the Pi draft agent, and turn rough notes into clean GitHub issues without leaving flow.',
  alternates: {
    canonical: '/docs'
  },
  openGraph: {
    url: '/docs',
    title: 'Pilog Docs',
    description:
      'Install Pilog, connect GitHub, configure the Pi draft agent, and turn rough notes into clean GitHub issues.'
  }
}

export const aboutMetadata: Metadata = {
  title: 'About',
  description:
    'Learn why Pilog is local-first by default, how capture stays separate from triage, and how the open source project is maintained.',
  alternates: {
    canonical: '/about'
  },
  openGraph: {
    url: '/about',
    title: 'About Pilog',
    description:
      'Learn why Pilog is local-first by default, how capture stays separate from triage, and how the open source project is maintained.'
  }
}

export const previewMetadata: Metadata = {
  title: 'Preview Downloads',
  description:
    'Download unsigned Pilog preview builds for testing only. Preview builds are pre-release software and are not the stable Public Download Path.',
  alternates: {
    canonical: '/preview'
  },
  robots: {
    index: false,
    follow: false
  },
  openGraph: {
    url: '/preview',
    title: 'Pilog Preview Downloads',
    description:
      'Download unsigned Pilog preview builds for testing only. Preview builds are not the stable Public Download Path.'
  }
}
