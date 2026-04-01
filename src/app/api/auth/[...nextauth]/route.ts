// src/app/api/auth/[...nextauth]/route.ts
export const runtime = 'nodejs'

import NextAuth, { type User, type Session } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { firestoreAdmin as firestore } from '@/lib/firebaseAdmin'

import { normalizeRole } from '@/lib/roles'
import type { JWT } from 'next-auth/jwt'
import type { AdapterUser } from 'next-auth/adapters'

// Helpers
const normLower = (s?: string) => (s || '').toString().trim().toLowerCase()

// Firestore User doc
interface FirestoreUser {
  userId?: string
  name?: string
  password?: string
  role?: string
  isAdmin?: boolean
  department?: string
  canRespondSurveys?: boolean
}

// Extend JWT
declare module 'next-auth/jwt' {
  interface JWT {
    role?: string
    isAdmin?: boolean
    department?: string
    deptLower?: string
    canRespondSurveys?: boolean
  }
}

// Extend Session
declare module 'next-auth' {
  interface Session {
    user?: {
      id: string
      role?: string
      isAdmin?: boolean
      department?: string
      deptLower?: string
      canRespondSurveys?: boolean
    } & User
  }
}

export const authOptions = {
  debug: false,
  // Habilita host dinàmic (preview/custom domains a Vercel)
  trustHost: true,
  providers: [
    CredentialsProvider({
      name: 'Usuari i Contrasenya (Firebase)',
      credentials: {
        username: { label: 'Usuari', type: 'text' },
        password: { label: 'Contrasenya', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials.password) {
          console.log('[AUTH] Falta usuari o password')
          return null
        }

        const usernameRaw = credentials.username.toString().trim()
        const usernameFold = normLower(usernameRaw)
        const passInput = credentials.password.toString().trim()

        console.log('[AUTH] Intent login amb:', usernameRaw, 'fold:', usernameFold)

        try {
          // 1) Buscar per nom exacte (compatibilitat antic)
          let snap = await firestore
            .collection('users')
            .where('name', '==', usernameRaw)
            .get()

          // 2) Fallback: buscar per nameFold (case/accents insensitive)
          if (snap.empty) {
            snap = await firestore
              .collection('users')
              .where('nameFold', '==', usernameFold)
              .get()
          }

          // 3) Fallback addicional: permetre login amb email exacta
          if (snap.empty) {
            snap = await firestore
              .collection('users')
              .where('email', '==', usernameRaw)
              .get()
          }

          if (snap.empty) {
            console.log('[AUTH] Usuari no trobat (name/nameFold/email):', usernameRaw)
            return null
          }

          for (const doc of snap.docs) {
            const data = doc.data() as FirestoreUser
            console.log('[AUTH] Usuari trobat:', { id: doc.id, name: data.name, role: data.role })

            const passDoc = (data.password || '').toString().trim()

            if (!passDoc) {
              console.log('[AUTH] Password buit a Firestore per', data.name)
              continue
            }

            if (passDoc === passInput) {
              console.log('[AUTH] Password correcte per:', data.name)

              if (!data.userId) {
                await doc.ref.set({ userId: doc.id }, { merge: true })
              }

              const roleNorm = normalizeRole(data.role)
              const isAdmin = Boolean(data.isAdmin || roleNorm === 'admin')
              const department = (data.department || '').toString().trim()

              return {
                id: data.userId || doc.id,
                name: data.name || '',
                role: isAdmin ? 'admin' : roleNorm,
                isAdmin,
                department,
                deptLower: normLower(department),
                canRespondSurveys: Boolean(data.canRespondSurveys),
              }
            } else {
              console.log('[AUTH] Password incorrecte. Input:', passInput, 'Doc:', passDoc)
            }
          }
        } catch (err) {
          console.error('[AUTH] Error inesperat a authorize:', err)
          return null
        }

        return null
      },
    }),
  ],
  session: { strategy: 'jwt' as const },
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: AdapterUser | User }) {
      if (user) {
        const u = user as User & {
          id: string
          role?: string
          isAdmin?: boolean
          department?: string
          canRespondSurveys?: boolean
        }

        token.sub = u.id
        token.isAdmin = Boolean(u.isAdmin || normalizeRole(u.role) === 'admin')
        token.role = token.isAdmin ? 'admin' : normalizeRole(u.role)
        token.department = u.department || ''
        token.deptLower = normLower(token.department)
        token.canRespondSurveys = Boolean(u.canRespondSurveys)
      }

      token.isAdmin = Boolean(token.isAdmin || normalizeRole(String(token.role || '')) === 'admin')
      if (token.role) {
        token.role = token.isAdmin ? 'admin' : normalizeRole(String(token.role))
      }
      if (!token.deptLower && token.department) {
        token.deptLower = normLower(token.department)
      }

      return token
    },

    async session({ session, token }: { session: Session; token: JWT }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.sub as string,
          role: token.role,
          isAdmin: token.isAdmin,
          department: token.department,
          deptLower: token.deptLower,
          canRespondSurveys: Boolean(token.canRespondSurveys),
        },
        accessToken: token,
      }
    },
  },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
