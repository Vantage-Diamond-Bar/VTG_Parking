'use client'

import { Playfair_Display } from 'next/font/google'

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['700'],
  display: 'swap',
})

/**
 * Shared brand name component — always renders "Vantage Community Parking"
 * in Playfair Display Bold.
 *
 * @param color  Text color (default: teal #0f766e for light backgrounds)
 * @param size   Font size (default: 1.15rem)
 */
export default function BrandName({
  color = '#0f766e',
  size = '1.15rem',
}: {
  color?: string
  size?: string
}) {
  return (
    <span
      className={playfair.className}
      style={{ color, fontSize: size, letterSpacing: '0.015em', lineHeight: 1.2 }}
    >
      Vantage Community Parking
    </span>
  )
}
