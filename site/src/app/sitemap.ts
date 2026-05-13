import type { MetadataRoute } from 'next'
import { createSitemap } from '@/lib/metadata'

export default function sitemap(): MetadataRoute.Sitemap {
  return createSitemap()
}
