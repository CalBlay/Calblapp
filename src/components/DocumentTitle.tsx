'use client'

import { useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { resolvePageTitle } from '@/lib/pageTitle'

export default function DocumentTitle() {
  const pathname = usePathname() ?? ''
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  useLayoutEffect(() => {
    const syncTitle = () => {
      const title = resolvePageTitle(
        pathnameRef.current,
        typeof window !== 'undefined' ? window.location.hash : ''
      )
      if (document.title !== title) {
        document.title = title
      }
    }

    syncTitle()

    const headObserver = new MutationObserver(syncTitle)
    headObserver.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    const onHashChange = () => syncTitle()
    window.addEventListener('hashchange', onHashChange)

    return () => {
      headObserver.disconnect()
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [pathname])

  return null
}
