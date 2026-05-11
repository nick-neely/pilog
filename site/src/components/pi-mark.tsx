import Image from 'next/image'
import { cn } from '@pilog/ui/utils'

type PiMarkProps = {
  variant?: 'icon' | 'mark'
  className?: string
  alt?: string
  priority?: boolean
  width?: number
  height?: number
}

/**
 * The Pi-on-notepage motif. Two sources: the full app icon (`/pi-icon.png`,
 * variant="icon") with its rounded warm-stone backdrop, and the bare tray
 * mark (`/pi-mark.png`, variant="mark") which is just the Pi glyph on a
 * stacked card. Used at hero scale, as the header wordmark glyph, and as
 * the faint watermark behind the closing CTA. Restraint earns the motif
 * its weight; do not multiply it past those three roles.
 */
export function PiMark({
  variant = 'icon',
  className,
  alt = 'The Pilog mark: a stylized Pi on a paper note',
  priority,
  width,
  height
}: PiMarkProps) {
  const src = variant === 'icon' ? '/pi-icon.png' : '/pi-mark.png'
  const w = width ?? (variant === 'icon' ? 480 : 360)
  const h = height ?? w
  return (
    <Image
      src={src}
      alt={alt}
      width={w}
      height={h}
      priority={priority}
      className={cn('select-none', className)}
      draggable={false}
    />
  )
}
