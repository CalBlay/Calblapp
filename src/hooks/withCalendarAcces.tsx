// file: src/hooks/withCalendarAccess.tsx
'use client'

import { useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

const ALLOWED_ROLES = ["Admin", "Direccio", "Comercial"]

export default function withCalendarAccess<P extends object>(WrappedComponent: React.ComponentType<P>) {
  return function ProtectedComponent(props: P) {
    const { data: session, status } = useSession()
    const router = useRouter()

    useEffect(() => {
      if (status === "loading") return
      if (!session?.user?.role || !ALLOWED_ROLES.includes(session.user.role)) {
        router.push("/login")
      }
    }, [session, status, router])

    if (status === "loading") return <p>Carregant…</p>
    if (!session?.user?.role) return null

    return <WrappedComponent {...props} />
  }
}
