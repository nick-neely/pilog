import Image from 'next/image'

type ScreenshotVariant = {
  key: 'A' | 'B' | 'C'
  label: string
  src: string
  alt: string
  className: string
}

const variants: ScreenshotVariant[] = [
  {
    key: 'A',
    label: 'Tilted paper',
    src: '/landing/pilog-app-screenshot-option-01-tilted-paper.png',
    alt: 'PiLog inbox screenshot presented on a warm paper background with a slight tilt',
    className: 'shadow-[0_18px_44px_oklch(0.22_0.012_60_/_0.10)]'
  },
  {
    key: 'B',
    label: 'Editorial flat',
    src: '/landing/pilog-app-screenshot-option-02-editorial-flat.png',
    alt: 'PiLog inbox screenshot presented straight-on against a warm editorial paper background',
    className: 'shadow-[0_16px_38px_oklch(0.22_0.012_60_/_0.08)]'
  },
  {
    key: 'C',
    label: 'Evening desk',
    src: '/landing/pilog-app-screenshot-option-03-evening-desk.png',
    alt: 'PiLog inbox screenshot glowing softly on a dark warm reading-room desk',
    className: 'shadow-[0_18px_48px_oklch(0.18_0.012_60_/_0.16)]'
  }
]

const DEFAULT_SCREENSHOT_VARIANT = 'A' satisfies ScreenshotVariant['key']

function getScreenshotVariant(key: ScreenshotVariant['key']) {
  return variants.find((variant) => variant.key === key) ?? variants[0]
}

/**
 * Keep the variants together so future A/B testing or a quick switch to B only
 * needs to change DEFAULT_SCREENSHOT_VARIANT, not the section markup.
 */
export function ProductScreenshot() {
  const current = getScreenshotVariant(DEFAULT_SCREENSHOT_VARIANT)

  return (
    <section aria-labelledby="product-screenshot-title" className="relative overflow-hidden">
      <h2 id="product-screenshot-title" className="sr-only">
        PiLog app preview
      </h2>
      <div className="mx-auto max-w-[84rem] px-4 pb-14 sm:px-6 md:-mt-10 md:pb-20">
        <Image
          src={current.src}
          alt={current.alt}
          width={1672}
          height={941}
          sizes="(min-width: 1440px) 1344px, calc(100vw - 32px)"
          priority={false}
          className={`block h-auto w-full rounded-xl ${current.className}`}
        />
      </div>
    </section>
  )
}
