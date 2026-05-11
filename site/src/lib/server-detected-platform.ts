import { headers } from 'next/headers'

import { detectPlatform, type DetectedPlatform } from './platform'

/** Request-time UA parse for marketing surfaces (aligned with `PlatformDownload` client detection). */
export async function getServerDetectedPlatform(): Promise<DetectedPlatform> {
  const h = await headers()
  return detectPlatform(h.get('user-agent') ?? '')
}
