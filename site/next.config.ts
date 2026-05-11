import type { NextConfig } from 'next'
import path from 'node:path'

// The marketing site consumes shadcn primitives from the Electron renderer via
// `@pilog/ui` (see packages/ui). Those primitives use `@renderer/*` internally,
// so Next's bundler needs to resolve that alias too. We register it on both
// turbopack (`dev`) and webpack (`build`) so behavior is identical either way.
const rendererSrc = path.resolve(__dirname, '../src/renderer/src')

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.resolve(__dirname, '..'),
  eslint: { ignoreDuringBuilds: true },
  turbopack: {
    resolveAlias: {
      '@renderer': rendererSrc
    }
  },
  webpack(config) {
    config.resolve = config.resolve ?? {}
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@renderer': rendererSrc
    }
    return config
  }
}

export default nextConfig
