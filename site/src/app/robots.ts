import type { MetadataRoute } from 'next'
import { createRobots } from '@/lib/metadata'

export default function robots(): MetadataRoute.Robots {
  return createRobots()
}
