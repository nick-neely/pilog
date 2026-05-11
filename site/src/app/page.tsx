import { Hero } from '@/components/landing/hero'
import { Transformation } from '@/components/landing/transformation'
import { Bento } from '@/components/landing/bento'
import { KeyboardFirst } from '@/components/landing/keyboard'
import { Principles } from '@/components/landing/principles'
import { Closing } from '@/components/landing/closing'
import { modKeyLabel } from '@/lib/platform'
import { getServerDetectedPlatform } from '@/lib/server-detected-platform'

/**
 * pilog.dev — the brand surface. The Electron app is the product; this page
 * speaks the same paper-warm language without being chrome. See PRODUCT.md
 * (anti-references) and DESIGN.md (Reading-Room Journal) — both the spec for
 * what this page must and must not be. shadcn primitives consumed via
 * @pilog/ui share a single source of truth with the Electron renderer
 * (see packages/ui/README.md).
 */
export default async function LandingPage() {
  const platform = await getServerDetectedPlatform()
  const modKey = modKeyLabel(platform)

  return (
    <>
      <Hero modKey={modKey} />
      <Transformation />
      <Bento modKey={modKey} />
      <KeyboardFirst modKey={modKey} />
      <Principles />
      <Closing modKey={modKey} />
    </>
  )
}
