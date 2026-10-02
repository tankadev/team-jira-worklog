import { ImageResponse } from 'next/og'

import { LOGO_PATHS } from './icons'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

// Full-bleed: iOS rounds the corners itself, so a drawn radius would show as a
// second, smaller curve inside its mask.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #16a79b, #0b7a71)',
        }}
      >
        <svg
          width="120"
          height="120"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={LOGO_PATHS.rim} />
          <path d={LOGO_PATHS.check} />
        </svg>
      </div>
    ),
    size,
  )
}
