import type { Metadata } from 'next'
import { resolvePageTitle } from '@/lib/pageTitle'

export const metadata: Metadata = {
  title: {
    absolute: resolvePageTitle('/login'),
  },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
