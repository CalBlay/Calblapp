import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { resolvePageTitle } from '@/lib/pageTitle'

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname')

  if (!pathname?.startsWith('/menu')) {
    return {}
  }

  return {
    title: {
      absolute: resolvePageTitle(pathname),
    },
  }
}

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return children
}
