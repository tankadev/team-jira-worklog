/**
 * Line icons for navigation and buttons, drawn inline so the app needs no icon
 * package. 24-unit grid, 1.75 stroke, `currentColor` — they take the colour of
 * the text they sit next to. Named after the glyph, not the screen using it.
 */
import type { SVGProps } from 'react'

export type IconName =
  | 'kanban'
  | 'search-check'
  | 'square-pen'
  | 'clipboard-list'
  | 'settings'
  | 'chart-line'
  | 'phone-upload'
  | 'package'
  | 'rocket'
  | 'pull-request'
  | 'refresh'
  | 'sun'
  | 'moon'
  | 'puzzle'
  | 'git-commit'
  | 'copy'
  | 'check'

const PATHS: Record<IconName, React.ReactNode> = {
  kanban: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 7v7M12 7v4M16 7v9" />
    </>
  ),
  'search-check': (
    <>
      <circle cx="11" cy="11" r="7.5" />
      <path d="m21 21-4.3-4.3M8 11l2 2 4-4" />
    </>
  ),
  'square-pen': (
    <>
      <path d="M12 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-6" />
      <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12.5 14.5 9 15.5l1-3.5z" />
    </>
  ),
  'clipboard-list': (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" />
    </>
  ),
  settings: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'chart-line': (
    <>
      <path d="M3 3v15a3 3 0 0 0 3 3h15" />
      <path d="m19 9-5 5-4-4-3 3" />
    </>
  ),
  'phone-upload': (
    <>
      <rect x="5" y="2" width="14" height="20" rx="2.5" />
      <path d="M12 14V7M9 10l3-3 3 3M11 18h2" />
    </>
  ),
  package: (
    <>
      <path d="M11 21.7a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7z" />
      <path d="M12 22V12M3.3 7l8.7 5 8.7-5M7.5 4.3l9 5.1" />
    </>
  ),
  rocket: (
    <>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </>
  ),
  'pull-request': (
    <>
      <circle cx="6" cy="6" r="2.75" />
      <circle cx="18" cy="18" r="2.75" />
      <path d="M6 8.75V21M18 15.25V8a2 2 0 0 0-2-2h-4M14.5 3.5 12 6l2.5 2.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />,
  'git-commit': (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M3 12h5.5M15.5 12H21" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  puzzle: (
    <path d="M10 3a2 2 0 0 1 4 0v2h4a1 1 0 0 1 1 1v4h-2a2 2 0 0 0 0 4h2v4a1 1 0 0 1-1 1h-4v-2a2 2 0 0 0-4 0v2H6a1 1 0 0 1-1-1v-4h2a2 2 0 0 0 0-4H5V6a1 1 0 0 1 1-1h4z" />
  ),
}

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {PATHS[name]}
    </svg>
  )
}

/**
 * The brand mark: a clock face whose hands are a check mark, the long hand
 * breaking out through a gap in the rim — "the time is logged". Same geometry
 * as app/icon.svg and app/apple-icon.tsx; change all three together.
 */
export const LOGO_PATHS = {
  rim: 'M19.83 10.34A8 8 0 1 1 14.47 4.39',
  check: 'M8.2 11.8l3 3L20 5',
}

export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d={LOGO_PATHS.rim} />
      <path d={LOGO_PATHS.check} />
    </svg>
  )
}
