import { Hero } from '@/components/landing/hero'
import { Transformation } from '@/components/landing/transformation'
import { Bento } from '@/components/landing/bento'
import { KeyboardFirst } from '@/components/landing/keyboard'
import { Principles } from '@/components/landing/principles'
import { Closing } from '@/components/landing/closing'

/**
 * pilog.dev — the brand surface. The Electron app is the product; this page
 * speaks the same paper-warm language without being chrome. See PRODUCT.md
 * (anti-references) and DESIGN.md (Reading-Room Journal) — both the spec for
 * what this page must and must not be. shadcn primitives consumed via
 * @pilog/ui share a single source of truth with the Electron renderer
 * (see packages/ui/README.md).
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <Transformation />
      <Bento />
      <KeyboardFirst />
      <Principles />
      <Closing />
    </>
  )
}
