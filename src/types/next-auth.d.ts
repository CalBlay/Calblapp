// file: src/types/next-auth.d.ts
import NextAuth, { DefaultSession } from "next-auth"
import { DefaultJWT } from "next-auth/jwt"

// Extensió del tipus Session
declare module "next-auth" {
  interface Session extends DefaultSession {
    accessToken?: string
    user?: {
      id?: string
      name?: string
      email?: string

      role?: string
      isAdmin?: boolean
      department?: string
      deptLower?: string
    } & DefaultSession["user"]
  }
}

// Extensió del tipus JWT
declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    accessToken?: string
    role?: string
    isAdmin?: boolean
    department?: string
    deptLower?: string
  }
}

export {} // OBLIGATORI
