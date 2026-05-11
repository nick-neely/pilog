import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  eslint: { ignoreDuringBuilds: true }
}

export default nextConfig
