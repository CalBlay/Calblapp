import type { LucideIcon, LucideProps } from 'lucide-react'

const OpsIconSvg = (props: LucideProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <circle cx="7.5" cy="6.9" r="1.7" />
    <circle cx="16.5" cy="6.9" r="1.7" />
    <path d="M6.3 11.1h2.4" />
    <path d="M15.3 11.1h2.4" />
    <path d="M6 15.6c.4-1.5 1.5-2.5 2.4-2.5s2 1 2.4 2.5" />
    <path d="M13.2 15.6c.4-1.5 1.5-2.5 2.4-2.5s2 1 2.4 2.5" />
    <path d="M5.3 18.1h4.8" />
    <path d="M14 18.1h4.8" />
    <rect x="7.1" y="16.6" width="0.9" height="0.9" rx="0.2" />
    <rect x="16" y="16.6" width="0.9" height="0.9" rx="0.2" />
    <circle cx="12" cy="3.7" r="0.55" />
    <path d="M11.5 4.1 10.2 5.3" />
    <path d="M12.5 4.1 13.8 5.3" />
  </svg>
)

const OpsIcon = OpsIconSvg as LucideIcon

export default OpsIcon
