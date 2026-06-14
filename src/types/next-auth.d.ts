// file: src/types/next-auth.d.ts
import type { DefaultSession } from "next-auth"
import type { DefaultJWT } from "next-auth/jwt"

// Extensió del tipus Session
declare module "next-auth" {
  interface Session extends DefaultSession {
    user?: {
      id?: string
      name?: string
      email?: string

      role?: string
      isAdmin?: boolean
      department?: string
      deptLower?: string
      commercialName?: string
      isTransportLead?: boolean
      opsProjectsConfigurable?: boolean
    } & DefaultSession["user"]
  }
}

// Extensió del tipus JWT
declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    role?: string
    isAdmin?: boolean
    department?: string
    deptLower?: string
    commercialName?: string
    isTransportLead?: boolean
    opsProjectsConfigurable?: boolean
  }
}

export {} // OBLIGATORI
